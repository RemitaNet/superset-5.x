# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import dataclasses
import re
import functools
import logging
import typing
from importlib.resources import files
from typing import Any, Callable, cast

from flask import (
    Flask,
    redirect,
    request,
    Response,
    send_file,
)
from flask_wtf.csrf import CSRFError
from sqlalchemy import exc
from werkzeug.exceptions import HTTPException

from superset import appbuilder
from superset.extensions import feature_flag_manager
from superset.commands.exceptions import CommandException, CommandInvalidError
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from superset.exceptions import (
    SupersetErrorException,
    SupersetErrorsException,
    SupersetException,
    SupersetSecurityException,
)
from superset.superset_typing import FlaskResponse
from superset.utils import core as utils, json
from superset.utils.log import get_logger_from_status

if typing.TYPE_CHECKING:
    from superset.views.base import BaseSupersetView


logger = logging.getLogger(__name__)

JSON_MIMETYPE = "application/json; charset=utf-8"


def get_error_level_from_status(
    status_code: int,
) -> ErrorLevel:
    if status_code < 400:
        return ErrorLevel.INFO
    if status_code < 500:
        return ErrorLevel.WARNING
    return ErrorLevel.ERROR


def json_error_response(
    error_details: str | SupersetError | list[SupersetError] | None = None,
    status: int = 500,
    payload: dict[str, Any] | None = None,
) -> FlaskResponse:
    payload = payload or {}

    if isinstance(error_details, list):
        payload["errors"] = [dataclasses.asdict(error) for error in error_details]
    elif isinstance(error_details, SupersetError):
        payload["errors"] = [dataclasses.asdict(error_details)]
    elif isinstance(error_details, str):
        payload["error"] = error_details

    return Response(
        json.dumps(payload, default=json.json_iso_dttm_ser, ignore_nan=True),
        status=status,
        mimetype=JSON_MIMETYPE,
    )


def handle_api_exception(
    f: Callable[..., FlaskResponse],
) -> Callable[..., FlaskResponse]:
    """
    A decorator to catch superset exceptions. Use it after the @api decorator above
    so superset exception handler is triggered before the handler for generic
    exceptions.
    """

    def wraps(self: BaseSupersetView, *args: Any, **kwargs: Any) -> FlaskResponse:
        try:
            return f(self, *args, **kwargs)
        except SupersetSecurityException as ex:
            logger.warning("SupersetSecurityException", exc_info=True)
            return json_error_response([ex.error], status=ex.status, payload=ex.payload)
        except SupersetErrorsException as ex:
            logger.warning(ex, exc_info=True)
            return json_error_response(ex.errors, status=ex.status)
        except SupersetErrorException as ex:
            logger.warning("SupersetErrorException", exc_info=True)
            return json_error_response([ex.error], status=ex.status)
        except SupersetException as ex:
            logger_func, _ = get_logger_from_status(ex.status)
            logger_func(ex.message, exc_info=True)
            return json_error_response(
                utils.error_msg_from_exception(ex), status=ex.status
            )
        except HTTPException as ex:
            logger.exception(ex)
            return json_error_response(
                utils.error_msg_from_exception(ex), status=cast(int, ex.code)
            )
        except (exc.IntegrityError, exc.DatabaseError, exc.DataError) as ex:
            logger.exception(ex)
            return json_error_response(utils.error_msg_from_exception(ex), status=422)
        except Exception as ex:  # pylint: disable=broad-except
            logger.exception(ex)
            return json_error_response(utils.error_msg_from_exception(ex))

    return functools.update_wrapper(wraps, f)


def set_app_error_handlers(app: Flask) -> None:  # noqa: C901
    """
    Set up error handlers for the Flask app
    Refer to SIP-40 and SIP-41 for more details on the error handling strategy
    """

    @app.errorhandler(SupersetErrorException)
    def show_superset_error(ex: SupersetErrorException) -> FlaskResponse:
        logger.warning("SupersetErrorException", exc_info=True)
        return json_error_response([ex.error], status=ex.status)

    @app.errorhandler(SupersetErrorsException)
    def show_superset_errors(ex: SupersetErrorsException) -> FlaskResponse:
        logger.warning("SupersetErrorsException", exc_info=True)
        return json_error_response(ex.errors, status=ex.status)

    @app.errorhandler(CSRFError)
    def refresh_csrf_token(ex: CSRFError) -> FlaskResponse:
        """Redirect to login if the CSRF token is expired"""
        logger.warning("Refresh CSRF token error", exc_info=True)

        if request.is_json:
            return show_http_exception(ex)

        return redirect(appbuilder.get_url_for_login)

    def _customize_error_html(content: str, code: int) -> str:
        """Inject custom asset URLs into static error HTML when enabled.

        This preserves the existing static HTML content and only swaps the
        favicon href and the main image src for 404/500.
        """
        try:
            assets = app.config.get("ERROR_PAGE_ASSETS", {})

            # Resolve favicon: ERROR_PAGE_ASSETS.favicon -> FAVICONS[0].href -> default
            favicon = assets.get("favicon") or (
                (app.config.get("FAVICONS") or [{}])[0].get("href")
                if app.config.get("FAVICONS")
                else None
            )
            if not favicon:
                favicon = "/static/assets/images/favicon.png"
            favicon = utils.sanitize_url(str(favicon))

            # Resolve image src based on code
            image_key = "image_404" if code == 404 else "image_500"
            default_img = (
                "/static/assets/images/error404.png"
                if code == 404
                else "/static/assets/images/error500.png"
            )
            image_src = utils.sanitize_url(str(assets.get(image_key) or default_img))

            # Replace favicon href in <link rel="icon" ... href="...">
            content = re.sub(
                r'(<link[^>]*rel="(?:icon|shortcut icon)"[^>]*href=")[^"]+(\")',
                rf'\1{favicon}\2',
                content,
                count=1,
                flags=re.IGNORECASE,
            )

            # Replace the error image src, using the alt attribute if present
            alt_text = "404" if code == 404 else "500"
            content = re.sub(
                rf'(<img[^>]*alt="{alt_text}"[^>]*src=")[^"]+(\")',
                rf'\1{image_src}\2',
                content,
                count=1,
                flags=re.IGNORECASE,
            )

            return content
        except Exception:  # if any replacement fails, return original content
            return content

    @app.errorhandler(HTTPException)
    def show_http_exception(ex: HTTPException) -> FlaskResponse:
        logger.warning("HTTPException", exc_info=True)

        if (
            "text/html" in request.accept_mimetypes
            and not app.config["DEBUG"]
            and ex.code in {404, 500}
        ):
            path = files("superset") / f"static/assets/{ex.code}.html"
            if feature_flag_manager.is_feature_enabled("CUSTOM_BRAND_ASSETS"):
                with open(path, "r", encoding="utf-8") as f:
                    html = f.read()
                html = _customize_error_html(html, int(ex.code or 500))
                return Response(html, mimetype="text/html; charset=utf-8"), int(ex.code or 500)
            return send_file(path, max_age=0), ex.code

        return json_error_response(
            [
                SupersetError(
                    message=utils.error_msg_from_exception(ex),
                    error_type=SupersetErrorType.GENERIC_BACKEND_ERROR,
                    level=ErrorLevel.ERROR,
                ),
            ],
            status=ex.code or 500,
        )

    @app.errorhandler(CommandException)
    def show_command_errors(ex: CommandException) -> FlaskResponse:
        """
        Temporary handler for CommandException; if an API raises a
        CommandException it should be fixed to map it to SupersetErrorException
        or SupersetErrorsException, with a specific status code and error type
        """
        logger.warning("CommandException", exc_info=True)

        if "text/html" in request.accept_mimetypes and not app.config["DEBUG"]:
            path = files("superset") / "static/assets/500.html"
            if feature_flag_manager.is_feature_enabled("CUSTOM_BRAND_ASSETS"):
                with open(path, "r", encoding="utf-8") as f:
                    html = f.read()
                html = _customize_error_html(html, 500)
                return Response(html, mimetype="text/html; charset=utf-8"), 500
            return send_file(path, max_age=0), 500

        extra = ex.normalized_messages() if isinstance(ex, CommandInvalidError) else {}
        return json_error_response(
            [
                SupersetError(
                    message=ex.message,
                    error_type=SupersetErrorType.GENERIC_COMMAND_ERROR,
                    level=get_error_level_from_status(ex.status),
                    extra=extra,
                ),
            ],
            status=ex.status,
        )

    @app.errorhandler(Exception)
    @app.errorhandler(500)
    def show_unexpected_exception(ex: Exception) -> FlaskResponse:
        """Catch-all, to ensure all errors from the backend conform to SIP-40"""
        logger.warning("Exception", exc_info=True)
        logger.exception(ex)

        if "text/html" in request.accept_mimetypes and not app.config["DEBUG"]:
            path = files("superset") / "static/assets/500.html"
            if feature_flag_manager.is_feature_enabled("CUSTOM_BRAND_ASSETS"):
                with open(path, "r", encoding="utf-8") as f:
                    html = f.read()
                html = _customize_error_html(html, 500)
                return Response(html, mimetype="text/html; charset=utf-8"), 500
            return send_file(path, max_age=0), 500

        return json_error_response(
            [
                SupersetError(
                    message=utils.error_msg_from_exception(ex),
                    error_type=SupersetErrorType.GENERIC_BACKEND_ERROR,
                    level=ErrorLevel.ERROR,
                ),
            ],
        )
