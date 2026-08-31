import json
import os
import re
import subprocess
import tempfile
import shutil
from urllib.parse import urlparse

from flask import Flask, Response, jsonify, request, send_file

app = Flask(__name__)


URL_RE = re.compile(r"^https?://", re.I)


def materialize_cookie_secret(env_name, default_path):
    """Write an injected cookie secret to an ephemeral container file."""
    secret = os.environ.get(env_name)

    if not secret:
        return default_path

    secret_dir = os.path.join(tempfile.gettempdir(), "monceda-secrets")
    os.makedirs(secret_dir, mode=0o700, exist_ok=True)
    secret_path = os.path.join(secret_dir, f"{env_name.lower()}.txt")

    with open(secret_path, "w", encoding="utf-8") as handle:
        handle.write(secret)
        if not secret.endswith("\n"):
            handle.write("\n")

    os.chmod(secret_path, 0o600)
    return secret_path

INSTAGRAM_COOKIE_SECRET_PATH = os.environ.get(
    "INSTAGRAM_COOKIE_SECRET_PATH",
    materialize_cookie_secret(
        "INSTAGRAM_COOKIES",
        "/secrets/instagram/cookies.txt",
    ),
)


def is_instagram_story_url(value):
    try:
        parsed = urlparse(value)
        host = re.sub(
            r"^www\.",
            "",
            (parsed.hostname or "").lower(),
        )

        return (
            parsed.scheme == "https"
            and host == "instagram.com"
            and re.match(
                r"^/stories/[^/]+/\d+/?$",
                parsed.path,
                re.I,
            )
            is not None
        )
    except Exception:
        return False


def copy_instagram_story_cookies(destination_dir=None):
    source = INSTAGRAM_COOKIE_SECRET_PATH

    if not os.path.isfile(source):
        return None

    fd, temp_path = tempfile.mkstemp(
        prefix="monceda-instagram-story-cookies-",
        suffix=".txt",
        dir=destination_dir,
    )
    os.close(fd)

    shutil.copyfile(source, temp_path)
    os.chmod(temp_path, 0o600)

    return temp_path


INSTAGRAM_SHORTCODE_ALPHABET = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789-_"
)


def instagram_media_id_to_shortcode(value):
    text = str(value or "").strip()

    if not text.isdigit():
        return ""

    number = int(text)

    if number <= 0:
        return ""

    result = ""

    while number:
        number, remainder = divmod(number, 64)
        result = (
            INSTAGRAM_SHORTCODE_ALPHABET[remainder]
            + result
        )

    return result


def select_instagram_story_info(info, url):
    if not isinstance(info, dict):
        return None

    entries = info.get("entries")

    if not isinstance(entries, list):
        return info

    story_id = ""

    try:
        parts = [
            item
            for item in urlparse(url).path.split("/")
            if item
        ]

        if len(parts) >= 3:
            story_id = parts[2]
    except Exception:
        story_id = ""

    if story_id:
        story_shortcode = (
            instagram_media_id_to_shortcode(story_id)
        )

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            entry_id = str(entry.get("id") or "")

            if (
                entry_id == story_id
                or (
                    story_shortcode
                    and entry_id == story_shortcode
                )
            ):
                return entry

    for entry in entries:
        if isinstance(entry, dict):
            return entry

    return None


def extract_instagram_story_info(url):
    cookie_path = copy_instagram_story_cookies()

    if not cookie_path:
        return (
            None,
            "instagram_story_auth_unavailable",
            "",
            503,
        )

    cmd = [
        "yt-dlp",
        "--cookies",
        cookie_path,
        "-f",
        (
            "bestvideo[vcodec^=avc1]+"
            "bestaudio[acodec^=mp4a]/"
            "bestvideo[vcodec^=avc1]+"
            "bestaudio[ext=m4a]/"
            "best[ext=mp4][vcodec^=avc1]/"
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/"
            "best[ext=mp4]"
        ),
        "--no-download",
        "--no-warnings",
        "--dump-single-json",
        url,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return (
            None,
            "instagram_story_extract_timeout",
            "",
            504,
        )
    finally:
        try:
            os.remove(cookie_path)
        except OSError:
            pass

    if result.returncode != 0:
        return (
            None,
            "instagram_story_extract_failed",
            result.stderr[-1500:],
            422,
        )

    try:
        root_info = json.loads(result.stdout)
    except json.JSONDecodeError:
        return (
            None,
            "instagram_story_invalid_response",
            "",
            502,
        )

    root_entries = (
        root_info.get("entries")
        if isinstance(root_info, dict)
        else None
    )

    info = select_instagram_story_info(
        root_info,
        url,
    )

    if isinstance(info, dict):
        info["_monceda_root_entries"] = (
            root_entries
            if isinstance(root_entries, list)
            else []
        )

    if not isinstance(info, dict):
        return (
            None,
            "instagram_story_media_missing",
            "",
            422,
        )

    return info, None, "", 200



def is_http_url(value):
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def choose_media(info):
    # yt-dlp's selected media URL is normally here.
    if is_http_url(info.get("url")):
        return info.get("url"), info.get("ext") or "mp4"

    # Some extractors return selected formats separately.
    requested = info.get("requested_formats") or []
    for item in requested:
        if is_http_url(item.get("url")) and item.get("vcodec") not in (None, "none"):
            return item["url"], item.get("ext") or "mp4"

    # Final fallback: choose the best video-bearing format.
    formats = info.get("formats") or []
    candidates = [
        item for item in formats
        if is_http_url(item.get("url"))
        and item.get("vcodec") not in (None, "none")
    ]

    if candidates:
        candidates.sort(
            key=lambda item: (
                item.get("acodec") not in (None, "none"),
                item.get("height") or 0,
                item.get("tbr") or 0,
            ),
            reverse=True,
        )
        selected = candidates[0]
        return selected["url"], selected.get("ext") or "mp4"

    return None, None


def choose_audio(info):
    # First prefer an explicitly requested audio stream.
    requested = info.get("requested_formats") or []

    audio_candidates = [
        item for item in requested
        if is_http_url(item.get("url"))
        and item.get("acodec") not in (None, "none")
        and item.get("vcodec") in (None, "none")
    ]

    # Otherwise inspect all available formats.
    if not audio_candidates:
        formats = info.get("formats") or []

        audio_candidates = [
            item for item in formats
            if is_http_url(item.get("url"))
            and item.get("acodec") not in (None, "none")
            and item.get("vcodec") in (None, "none")
        ]

    if not audio_candidates:
        return None

    audio_candidates.sort(
        key=lambda item: (
            item.get("abr") or 0,
            item.get("tbr") or 0,
        ),
        reverse=True,
    )

    return audio_candidates[0]["url"]


@app.get("/")
def health():
    return jsonify({
        "status": "ok",
        "service": "monceda-grab-fallback",
        "engine": "yt-dlp",
        "build": "bilibili-tv-454bcf1",
    })


@app.get("/debug/impersonation")
def debug_impersonation():
    result = subprocess.run(
        ["yt-dlp", "--list-impersonate-targets"],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    return jsonify({
        "status": "ok" if result.returncode == 0 else "error",
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    })


@app.post("/instagram/download")
def instagram_download():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not url or not URL_RE.match(url):
        return jsonify({
            "status": "error",
            "error": "invalid_url",
        }), 400

    try:
        host = re.sub(
            r"^www\.",
            "",
            urlparse(url).hostname or "",
        )
    except Exception:
        host = ""

    if host != "instagram.com":
        return jsonify({
            "status": "error",
            "error": "unsupported_host",
        }), 400

    temp_dir = tempfile.mkdtemp(
        prefix="monceda-instagram-"
    )

    output_template = os.path.join(
        temp_dir,
        "media.%(ext)s",
    )

    try:
        #
        # IMPORTANT:
        # No transcoding here.
        #
        # Select H.264 video + AAC/M4A audio and let
        # yt-dlp/FFmpeg MERGE them into one MP4.
        #
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "-f",
            (
                "bestvideo[vcodec^=avc1]+"
                "bestaudio[acodec^=mp4a]/"
                "bestvideo[vcodec^=avc1]+"
                "bestaudio[ext=m4a]/"
                "best[ext=mp4][vcodec^=avc1]/"
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/"
                "best[ext=mp4]"
            ),
            "--merge-output-format",
            "mp4",
            "-o",
            output_template,
            url,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

        if result.returncode != 0:
            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )

            return jsonify({
                "status": "error",
                "error": "instagram_download_failed",
                "detail": result.stderr[-1200:],
            }), 422

        candidates = []

        for name in os.listdir(temp_dir):
            path = os.path.join(temp_dir, name)

            if (
                os.path.isfile(path)
                and name.lower().endswith(".mp4")
            ):
                candidates.append(path)

        if not candidates:
            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )

            return jsonify({
                "status": "error",
                "error": "instagram_mp4_missing",
            }), 422

        final_path = max(
            candidates,
            key=os.path.getsize,
        )

        response = send_file(
            final_path,
            mimetype="video/mp4",
            as_attachment=True,
            download_name="instagram-video.mp4",
            conditional=False,
        )

        response.headers["Cache-Control"] = (
            "private, no-store"
        )
        response.headers[
            "X-Monceda-Instagram"
        ] = "h264-aac-merged"

        response.call_on_close(
            lambda: shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )
        )

        return response

    except subprocess.TimeoutExpired:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        return jsonify({
            "status": "error",
            "error": "instagram_download_timeout",
        }), 504

    except Exception as error:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        app.logger.exception(
            "Instagram merged download failed"
        )

        return jsonify({
            "status": "error",
            "error": "instagram_download_failed",
            "detail": str(error),
        }), 500


def is_instagram_media_url(value):
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()

        return (
            parsed.scheme == "https"
            and (
                host == "fbcdn.net"
                or host.endswith(".fbcdn.net")
                or host == "cdninstagram.com"
                or host.endswith(".cdninstagram.com")
            )
        )
    except Exception:
        return False




@app.post("/instagram/story/debug")
def instagram_story_debug():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    is_direct_story = is_instagram_story_url(url)

    try:
        parsed = urlparse(url)
        debug_host = re.sub(
            r"^www\.",
            "",
            (parsed.hostname or "").lower(),
        )
        is_story_tray = (
            parsed.scheme == "https"
            and debug_host == "instagram.com"
            and re.match(
                r"^/stories/[^/]+/?$",
                parsed.path,
                re.I,
            )
            is not None
        )
    except Exception:
        is_story_tray = False

    if not (is_direct_story or is_story_tray):
        return jsonify({
            "status": "error",
            "error": "invalid_instagram_story_url",
        }), 400

    cookie_path = copy_instagram_story_cookies()

    if not cookie_path:
        return jsonify({
            "status": "error",
            "error": "instagram_story_auth_unavailable",
        }), 503

    cmd = [
        "yt-dlp",
        "--cookies",
        cookie_path,
        "--no-download",
        "--no-warnings",
        "--dump-single-json",
        url,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    finally:
        try:
            os.remove(cookie_path)
        except OSError:
            pass

    if result.returncode != 0:
        return jsonify({
            "status": "error",
            "error": "yt_dlp_failed",
            "stderr": result.stderr[-1500:],
        }), 422

    try:
        info = json.loads(result.stdout)
    except Exception as error:
        return jsonify({
            "status": "error",
            "error": "invalid_json",
            "detail": str(error),
        }), 502

    def summarize(obj):
        if not isinstance(obj, dict):
            return {
                "type": type(obj).__name__,
            }

        formats = obj.get("formats") or []

        return {
            "keys": sorted(obj.keys()),
            "id": obj.get("id"),
            "title": obj.get("title"),
            "webpage_url": obj.get("webpage_url"),
            "url_present": isinstance(obj.get("url"), str),
            "url_host": (
                urlparse(obj.get("url")).hostname
                if isinstance(obj.get("url"), str)
                else None
            ),
            "ext": obj.get("ext"),
            "vcodec": obj.get("vcodec"),
            "acodec": obj.get("acodec"),
            "format_count": len(formats),
            "formats": [
                {
                    "format_id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "vcodec": f.get("vcodec"),
                    "acodec": f.get("acodec"),
                    "height": f.get("height"),
                    "url_present": isinstance(f.get("url"), str),
                    "url_host": (
                        urlparse(f.get("url")).hostname
                        if isinstance(f.get("url"), str)
                        else None
                    ),
                }
                for f in formats[:30]
                if isinstance(f, dict)
            ],
        }

    entries = info.get("entries")

    return jsonify({
        "status": "ok",
        "root": summarize(info),
        "entry_count": (
            len(entries)
            if isinstance(entries, list)
            else None
        ),
        "entries": [
            summarize(entry)
            for entry in (entries or [])[:10]
            if isinstance(entry, dict)
        ],
    })


@app.post("/instagram/story/raw-debug")
def instagram_story_raw_debug():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    try:
        parsed = urlparse(url)
        host = re.sub(
            r"^www\.",
            "",
            (parsed.hostname or "").lower(),
        )

        parts = [
            part
            for part in parsed.path.split("/")
            if part
        ]

        valid_story = (
            parsed.scheme == "https"
            and host == "instagram.com"
            and len(parts) >= 2
            and parts[0].lower() == "stories"
            and parts[1].lower() != "highlights"
        )

        username = parts[1] if valid_story else ""

    except Exception:
        valid_story = False
        username = ""

    if not valid_story:
        return jsonify({
            "status": "error",
            "error": "invalid_instagram_story_url",
        }), 400

    cookie_path = copy_instagram_story_cookies()

    if not cookie_path:
        return jsonify({
            "status": "error",
            "error": "instagram_story_auth_unavailable",
        }), 503

    try:
        import requests
    except Exception as exc:
        try:
            os.remove(cookie_path)
        except OSError:
            pass

        return jsonify({
            "status": "error",
            "error": "requests_unavailable",
            "detail": str(exc),
        }), 500

    session = requests.Session()

    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/140.0.0.0 Safari/537.36"
        ),
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "359341",
        "X-IG-WWW-Claim": "0",
        "Origin": "https://www.instagram.com",
        "Accept": "*/*",
        "Referer": "https://www.instagram.com/",
    })

    try:
        with open(
            cookie_path,
            "r",
            encoding="utf-8",
            errors="ignore",
        ) as handle:
            for line in handle:
                line = line.rstrip("\n")

                if (
                    not line
                    or line.startswith("#")
                    or "\t" not in line
                ):
                    continue

                parts_cookie = line.split("\t")

                if len(parts_cookie) != 7:
                    continue

                (
                    domain,
                    _,
                    cookie_path_value,
                    secure,
                    _,
                    name,
                    value,
                ) = parts_cookie

                session.cookies.set(
                    name,
                    value,
                    domain=domain.lstrip("."),
                    path=cookie_path_value or "/",
                    secure=(secure.upper() == "TRUE"),
                )

        story_page_url = (
            "https://www.instagram.com/stories/"
            f"{username}/"
        )

        page_response = session.get(
            story_page_url,
            timeout=30,
            allow_redirects=True,
        )

        if page_response.status_code != 200:
            return jsonify({
                "status": "error",
                "error": "story_page_http_error",
                "http_status": page_response.status_code,
            }), 502

        page_text = page_response.text or ""

        match = re.search(
            r'"user"\s*:\s*(\{.*?\})\s*,\s*"status"',
            page_text,
        )

        user_id = ""

        if match:
            try:
                user_data = json.loads(match.group(1))
                user_id = str(
                    user_data.get("pk")
                    or user_data.get("id")
                    or ""
                )
            except Exception:
                user_id = ""

        if not user_id:
            patterns = [
                r'"pk"\s*:\s*"?(?P<id>\d+)"?',
                r'"id"\s*:\s*"(?P<id>\d+)"',
            ]

            for pattern in patterns:
                candidate = re.search(
                    pattern,
                    page_text,
                )

                if candidate:
                    user_id = candidate.group("id")
                    break

        if not user_id:
            return jsonify({
                "status": "error",
                "error": "story_user_id_missing",
                "page_bytes": len(page_text),
            }), 422

        api_url = (
            "https://www.instagram.com/api/v1/"
            "feed/reels_media/"
        )

        api_response = session.get(
            api_url,
            params={
                "reel_ids": user_id,
            },
            timeout=30,
            allow_redirects=True,
        )

        if api_response.status_code != 200:
            return jsonify({
                "status": "error",
                "error": "reels_media_http_error",
                "http_status": api_response.status_code,
            }), 502

        try:
            payload = api_response.json()
        except Exception as exc:
            return jsonify({
                "status": "error",
                "error": "reels_media_invalid_json",
                "detail": str(exc),
            }), 502

        reels = payload.get("reels")

        if not isinstance(reels, dict):
            reels = {}

        reel_summaries = []

        for reel_key, reel_value in reels.items():
            if not isinstance(reel_value, dict):
                continue

            reel_items = reel_value.get("items")

            if not isinstance(reel_items, list):
                reel_items = []

            reel_user = reel_value.get("user")

            if not isinstance(reel_user, dict):
                reel_user = {}

            reel_summaries.append({
                "key_matches_page_user_id": (
                    str(reel_key) == str(user_id)
                ),
                "key_length": len(str(reel_key)),
                "user_pk_matches_page_user_id": (
                    str(
                        reel_user.get("pk")
                        or reel_user.get("id")
                        or ""
                    ) == str(user_id)
                ),
                "item_count": len(reel_items),
            })

        reel = (
            reels.get(user_id)
            if isinstance(reels.get(user_id), dict)
            else {}
        )

        raw_items = reel.get("items")

        if not isinstance(raw_items, list):
            raw_items = []

        if not raw_items:
            for candidate in reels.values():
                if not isinstance(candidate, dict):
                    continue

                candidate_items = candidate.get("items")

                if isinstance(candidate_items, list):
                    raw_items = candidate_items
                    break

        summaries = []

        for index, item in enumerate(raw_items, 1):
            if not isinstance(item, dict):
                continue

            video_versions = item.get(
                "video_versions"
            )

            if not isinstance(video_versions, list):
                video_versions = []

            image_candidates = (
                (
                    item.get("image_versions2")
                    or {}
                ).get("candidates")
            )

            if not isinstance(image_candidates, list):
                image_candidates = []

            carousel_media = item.get(
                "carousel_media"
            )

            if not isinstance(carousel_media, list):
                carousel_media = []

            summaries.append({
                "index": index,
                "pk": str(
                    item.get("pk")
                    or item.get("id")
                    or ""
                ),
                "media_type": item.get(
                    "media_type"
                ),
                "product_type": item.get(
                    "product_type"
                ),
                "video_version_count": len(
                    video_versions
                ),
                "image_candidate_count": len(
                    image_candidates
                ),
                "carousel_count": len(
                    carousel_media
                ),
                "has_video": bool(
                    video_versions
                ),
                "has_image": bool(
                    image_candidates
                ),
            })

        return jsonify({
            "status": "ok",
            "username": username,
            "user_id_present": bool(user_id),
            "api_status": payload.get("status"),
            "api_message": payload.get("message"),
            "payload_keys": sorted(payload.keys()),
            "reels_present": isinstance(
                payload.get("reels"),
                dict,
            ),
            "reel_count": len(reels),
            "page_user_id_matches_reel_key": (
                str(user_id) in {
                    str(key)
                    for key in reels.keys()
                }
            ),
            "reels": reel_summaries,
            "raw_item_count": len(raw_items),
            "items": summaries,
        })

    except requests.RequestException as exc:
        return jsonify({
            "status": "error",
            "error": "raw_story_request_failed",
            "detail": str(exc),
        }), 502

    finally:
        try:
            os.remove(cookie_path)
        except OSError:
            pass



@app.post("/instagram/story/extract")
def instagram_story_extract():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_instagram_story_url(url):
        return jsonify({
            "status": "error",
            "error": "invalid_instagram_story_url",
        }), 400

    info, error, detail, status_code = (
        extract_instagram_story_info(url)
    )

    if error:
        return jsonify({
            "status": "error",
            "error": error,
            **({"detail": detail} if detail else {}),
        }), status_code

    media_url, ext = choose_media(info)
    audio_url = choose_audio(info)

    if (
        not media_url
        or not is_instagram_media_url(media_url)
    ):
        return jsonify({
            "status": "error",
            "error": "instagram_story_media_missing",
        }), 422

    if (
        audio_url
        and not is_instagram_media_url(audio_url)
    ):
        audio_url = None

    media_id = str(info.get("id") or "story")

    story_items = []

    root_entries = info.get("_monceda_root_entries")

    if not isinstance(root_entries, list):
        root_entries = []

    for index, entry in enumerate(root_entries):
        if not isinstance(entry, dict):
            continue

        item_media_url, item_ext = choose_media(entry)
        item_audio_url = choose_audio(entry)

        if (
            not item_media_url
            or not is_instagram_media_url(item_media_url)
        ):
            continue

        if (
            item_audio_url
            and not is_instagram_media_url(item_audio_url)
        ):
            item_audio_url = None

        item_id = str(
            entry.get("id")
            or f"story-{index + 1}"
        )

        item = {
            "id": item_id,
            "index": index + 1,
            "url": item_media_url,
            "ext": item_ext or "mp4",
            "filename": (
                f"instagram_story_{item_id}."
                f"{item_ext or 'mp4'}"
            ),
            "title": str(
                entry.get("title")
                or f"Instagram Story {index + 1}"
            ).strip(),
            "duration": entry.get("duration"),
        }

        if item_audio_url:
            item["audio_url"] = item_audio_url

        item_thumbnail = entry.get("thumbnail")

        if (
            isinstance(item_thumbnail, str)
            and item_thumbnail.startswith("https://")
        ):
            item["thumbnail"] = item_thumbnail

        story_items.append(item)

    response = {
        "status": "ok",
        "engine": "yt-dlp",
        "instagram_story": True,
        "id": media_id,
        "ext": ext or "mp4",
        "filename": f"instagram_story_{media_id}.mp4",
        "url": media_url,
        "title": str(
            info.get("title")
            or "Instagram Story"
        ).strip(),
        "author": str(
            info.get("uploader")
            or info.get("channel")
            or info.get("creator")
            or ""
        ).strip(),
        "duration": info.get("duration"),
        "upload_date": str(
            info.get("upload_date") or ""
        ).strip(),
    }

    if audio_url:
        response["audio_url"] = audio_url

    if story_items:
        response["items"] = story_items
        response["item_count"] = len(story_items)

    return jsonify(response)


@app.post("/instagram/story/download")
def instagram_story_download():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_instagram_story_url(url):
        return jsonify({
            "status": "error",
            "error": "invalid_instagram_story_url",
        }), 400

    info, error, detail, status_code = (
        extract_instagram_story_info(url)
    )

    if error:
        return jsonify({
            "status": "error",
            "error": error,
            **({"detail": detail} if detail else {}),
        }), status_code

    media_url, _ = choose_media(info)
    audio_url = choose_audio(info)

    if (
        not media_url
        or not is_instagram_media_url(media_url)
    ):
        return jsonify({
            "status": "error",
            "error": "instagram_story_media_missing",
        }), 422

    if (
        audio_url
        and not is_instagram_media_url(audio_url)
    ):
        audio_url = None

    temp_dir = tempfile.mkdtemp(
        prefix="monceda-instagram-story-"
    )

    final_path = os.path.join(
        temp_dir,
        "instagram-story.mp4",
    )

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-threads",
        "2",
        "-i",
        media_url,
    ]

    if audio_url:
        cmd += [
            "-i",
            audio_url,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
        ]
    else:
        cmd += [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
        ]

    cmd += [
        "-c:v",
        "libx264",
        "-preset",
        "superfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        final_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        return jsonify({
            "status": "error",
            "error": "instagram_story_transcode_timeout",
        }), 504

    if (
        result.returncode != 0
        or not os.path.isfile(final_path)
        or os.path.getsize(final_path) == 0
    ):
        detail = result.stderr[-1500:]

        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        return jsonify({
            "status": "error",
            "error": "instagram_story_transcode_failed",
            "detail": detail,
        }), 422

    response = send_file(
        final_path,
        mimetype="video/mp4",
        as_attachment=True,
        download_name="instagram-story.mp4",
        conditional=False,
    )

    response.headers["Cache-Control"] = (
        "private, no-store"
    )
    response.headers[
        "X-Monceda-Instagram-Story"
    ] = "h264-aac"

    response.call_on_close(
        lambda: shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )
    )

    return response


@app.post("/instagram/normalize")
def instagram_normalize():
    data = request.get_json(silent=True) or {}
    media_url = str(data.get("url", "")).strip()
    audio_url = str(data.get("audio_url", "")).strip()
    fast_remux = data.get("fast_remux") is True

    if not is_instagram_media_url(media_url):
        return jsonify({
            "status": "error",
            "error": "invalid_media_url",
        }), 400

    if audio_url and not is_instagram_media_url(audio_url):
        return jsonify({
            "status": "error",
            "error": "invalid_audio_url",
        }), 400

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-i",
        media_url,
    ]

    if audio_url:
        cmd += [
            "-i",
            audio_url,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
        ]
    else:
        cmd += [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
        ]

    if fast_remux:
        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "high",
            "-level",
            "4.1",
            "-threads",
            "2",
            "-c:a",
            "copy",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-f",
            "mp4",
            "pipe:1",
        ]
    else:
        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "superfast",
            "-tune",
            "zerolatency",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "2",

            "-c:a",
            "aac",
            "-b:a",
            "96k",

            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-f",
            "mp4",
            "pipe:1",
        ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        bufsize=0,
    )

    def generate():
        try:
            while True:
                chunk = process.stdout.read(256 * 1024)

                if not chunk:
                    break

                yield chunk
        finally:
            if process.stdout:
                process.stdout.close()

            if process.poll() is None:
                process.terminate()

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    response = Response(
        generate(),
        mimetype="video/mp4",
        direct_passthrough=True,
    )

    response.headers["Content-Disposition"] = (
        'attachment; filename="instagram-video.mp4"'
    )
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Monceda-Instagram"] = "h264-stream"

    if fast_remux:
        response.headers[
            "X-Monceda-Instagram"
        ] = "h264-aac-fast-compatible"

    return response


@app.post("/extract")
def extract():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not url or not URL_RE.match(url):
        return jsonify({
            "status": "error",
            "error": "invalid_url",
        }), 400

    try:
        host = re.sub(r"^www\.", "", urlparse(url).hostname or "")
    except Exception:
        host = ""

    supported_hosts = {
        "instagram.com",
        "tiktok.com",
        "vm.tiktok.com",
        "vt.tiktok.com",
        "bsky.app",
        "dailymotion.com",
        "dai.ly",
        "vimeo.com",
        "player.vimeo.com",
        "bilibili.tv",
    }

    if host not in supported_hosts:
        return jsonify({
            "status": "error",
            "error": "unsupported_host",
        }), 400

    cookie_path = None

    try:
        request_path = urlparse(url).path or ""
    except Exception:
        request_path = ""

    is_instagram_post = (
        host == "instagram.com"
        and re.match(
            r"^/p/[^/]+/?$",
            request_path,
            re.I,
        )
        is not None
    )

    cmd = [
        "yt-dlp",
    ]

    if host == "instagram.com":
        cookie_path = copy_instagram_story_cookies()

        if cookie_path:
            cmd.extend([
                "--cookies",
                cookie_path,
            ])

    if is_instagram_post:
        #
        # Instagram photo/carousel posts can contain entries
        # without conventional video formats. Keep those
        # entries so their original image metadata can be
        # normalized below.
        #
        cmd.extend([
            "--ignore-no-formats-error",
            "--no-download",
            "--no-warnings",
            "--dump-single-json",
            url,
        ])
    else:
        #
        # Preserve the existing single-media behavior for
        # Reels and every other supported platform.
        #
        cmd.extend([
            "--no-playlist",
            "--no-download",
            "--no-warnings",
            "--dump-single-json",
            url,
        ])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return jsonify({
            "status": "error",
            "error": "extract_timeout",
        }), 504
    finally:
        if cookie_path:
            try:
                os.remove(cookie_path)
            except OSError:
                pass

    if result.returncode != 0:
        return jsonify({
            "status": "error",
            "error": "extract_failed",
            "detail": result.stderr[-1000:],
        }), 422

    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        return jsonify({
            "status": "error",
            "error": "invalid_extractor_response",
        }), 502

    media_url, ext = choose_media(info)

    media_id = str(info.get("id") or "media")

    #
    # Instagram photo / carousel support.
    #
    # yt-dlp can expose image posts and sidecar/carousel entries
    # without a conventional video stream. Normalize those entries
    # into the same items[] contract already used by Stories.
    #
    instagram_items = []

    if host == "instagram.com":
        raw_entries = info.get("entries")

        if not isinstance(raw_entries, list):
            raw_entries = []

        candidates = raw_entries if raw_entries else [info]

        for index, entry in enumerate(candidates, 1):
            if not isinstance(entry, dict):
                continue

            entry_url, entry_ext = choose_media(entry)

            thumbnail = entry.get("thumbnail")

            #
            # Photo posts expose several thumbnail/image
            # candidates. Prefer the last valid candidate,
            # which yt-dlp orders as the strongest available
            # image for these Instagram entries.
            #
            if not entry_url:
                thumbnails = entry.get("thumbnails")

                if isinstance(thumbnails, list):
                    image_candidates = [
                        item
                        for item in thumbnails
                        if isinstance(item, dict)
                        and is_instagram_media_url(
                            item.get("url")
                        )
                    ]

                    if image_candidates:
                        selected_image = image_candidates[-1]
                        entry_url = selected_image.get("url")
                        entry_ext = (
                            str(
                                selected_image.get("ext")
                                or entry.get("ext")
                                or "jpg"
                            )
                            .lower()
                        )

            #
            # Fallback for single-photo metadata where only
            # the canonical thumbnail field is available.
            #
            if not entry_url and isinstance(thumbnail, str):
                if is_instagram_media_url(thumbnail):
                    entry_url = thumbnail
                    entry_ext = (
                        str(entry.get("ext") or "jpg")
                        .lower()
                    )

            if not entry_url:
                continue

            clean_ext = str(entry_ext or "mp4").lower()

            media_type = (
                "image"
                if clean_ext
                in {
                    "jpg",
                    "jpeg",
                    "png",
                    "webp",
                    "gif",
                    "avif",
                }
                else "video"
            )

            item_id = str(
                entry.get("id")
                or f"{media_id}_{index}"
            )

            item = {
                "id": item_id,
                "index": index,
                "type": media_type,
                "ext": clean_ext,
                "url": entry_url,
                "filename": (
                    f"instagram_post_{item_id}."
                    f"{clean_ext}"
                ),
                "title": str(
                    entry.get("title")
                    or info.get("title")
                    or ""
                ).strip(),
                "duration": entry.get("duration"),
            }

            entry_thumbnail = entry.get("thumbnail")

            if (
                isinstance(entry_thumbnail, str)
                and is_instagram_media_url(
                    entry_thumbnail
                )
            ):
                item["thumbnail"] = entry_thumbnail

            instagram_items.append(item)

        #
        # If no conventional video was selected but Instagram
        # returned an image item, use the first item as the
        # top-level media as well.
        #
        if not media_url and instagram_items:
            media_url = instagram_items[0]["url"]
            ext = instagram_items[0]["ext"]

    if not media_url:
        return jsonify({
            "status": "error",
            "error": "no_media",
        }), 422

    audio_url = (
        choose_audio(info)
        if host == "instagram.com"
        else None
    )

    response = {
        "status": "ok",
        "engine": "yt-dlp",
        "id": media_id,
        "ext": ext,
        "filename": f"{host.replace('.', '_')}_{media_id}.{ext}",
        "url": media_url,
        "title": str(info.get("title") or "").strip(),
        "author": str(
            info.get("uploader")
            or info.get("channel")
            or info.get("creator")
            or ""
        ).strip(),
        "duration": info.get("duration"),
        "upload_date": str(info.get("upload_date") or "").strip(),
    }

    if audio_url:
        response["audio_url"] = audio_url

    if instagram_items:
        response["items"] = instagram_items
        response["item_count"] = len(instagram_items)

    return jsonify(response)




FACEBOOK_COOKIE_SECRET_PATH = os.environ.get(
    "FACEBOOK_COOKIE_SECRET_PATH",
    materialize_cookie_secret(
        "FACEBOOK_COOKIES",
        "/secrets/facebook/cookies.txt",
    ),
)


def copy_facebook_story_cookies(destination_dir=None):
    source = FACEBOOK_COOKIE_SECRET_PATH

    if not os.path.isfile(source):
        return None

    fd, temp_path = tempfile.mkstemp(
        prefix="monceda-facebook-story-cookies-",
        suffix=".txt",
        dir=destination_dir,
    )
    os.close(fd)

    shutil.copyfile(source, temp_path)
    os.chmod(temp_path, 0o600)

    return temp_path


def facebook_story_browser_headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/139.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }


def extract_facebook_story_photo_items(html):
    if not isinstance(html, str) or len(html) < 10000:
        return []

    # Facebook's initial Story payload contains many fbcdn images,
    # including avatars/thumbnails. Story photos use the post-image
    # t39.30808-6 path, while profile pictures normally use
    # t39.30808-1. Keep only the former.
    pattern = re.compile(
        r'https:\\?/\\?/scontent[^"\\]+?'
        r'/v/t39\.30808-6/[^"\\]+?\.jpg[^"\\]*',
        re.I,
    )

    candidates = []

    for match in pattern.findall(html):
        value = match

        # Decode the common JSON/HTML escaping used by Facebook.
        value = value.replace(r"\/", "/")
        value = value.replace(r"\u0025", "%")
        value = value.replace(r"\u0026", "&")
        value = value.replace("&amp;", "&")

        try:
            value = bytes(
                value,
                "utf-8",
            ).decode("unicode_escape")
        except Exception:
            pass

        if not value.startswith("https://"):
            continue

        filename_match = re.search(
            r"/([^/?]+\.jpg)",
            value,
            re.I,
        )

        if not filename_match:
            continue

        filename = filename_match.group(1)

        # Strong signal from the authenticated Story payload:
        # actual Story image filenames contain the owner's numeric
        # post/story identifier and are not profile-picture URLs.
        score = 0

        if "/v/t39.30808-6/" in value:
            score += 100

        if "dst-jpg" in value:
            score += 25

        size_matches = re.findall(
            r"(?:mx|s)(\d{3,4})x(\d{3,4})",
            value,
            re.I,
        )

        max_area = 0

        for width, height in size_matches:
            try:
                area = int(width) * int(height)
            except Exception:
                continue

            max_area = max(max_area, area)

        if max_area >= 1000000:
            score += 60
        elif max_area >= 500000:
            score += 40

        candidates.append({
            "url": value,
            "filename": filename,
            "score": score,
            "area": max_area,
        })

    # Deduplicate by the stable Facebook image filename.
    best_by_filename = {}

    for item in candidates:
        key = item["filename"]

        previous = best_by_filename.get(key)

        if previous is None or (
            item["score"],
            item["area"],
            len(item["url"]),
        ) > (
            previous["score"],
            previous["area"],
            len(previous["url"]),
        ):
            best_by_filename[key] = item

    ranked = sorted(
        best_by_filename.values(),
        key=lambda item: (
            item["score"],
            item["area"],
        ),
        reverse=True,
    )

    # Do not expose weak avatar/UI candidates.
    ranked = [
        item
        for item in ranked
        if item["score"] >= 125
    ]

    result = []

    for index, item in enumerate(ranked, 1):
        result.append({
            "index": index,
            "id": item["filename"].rsplit(".", 1)[0],
            "type": "image",
            "ext": "jpg",
            "filename": item["filename"],
            "url": item["url"],
            "thumbnail": item["url"],
        })

    return result


def fetch_facebook_story_html(url):
    cookie_path = copy_facebook_story_cookies()

    if not cookie_path:
        return (
            None,
            "facebook_story_auth_unavailable",
            "",
            503,
        )

    try:
        import requests
    except Exception as exc:
        try:
            os.unlink(cookie_path)
        except OSError:
            pass

        return (
            None,
            "facebook_story_requests_unavailable",
            str(exc),
            500,
        )

    session = requests.Session()
    session.headers.update(
        facebook_story_browser_headers()
    )

    try:
        # requests does not directly consume Netscape cookie files.
        # Parse only valid cookie records from the mounted secret.
        with open(
            cookie_path,
            "r",
            encoding="utf-8",
            errors="ignore",
        ) as handle:
            for line in handle:
                line = line.rstrip("\n")

                if (
                    not line
                    or line.startswith("#")
                    or "\t" not in line
                ):
                    continue

                parts = line.split("\t")

                if len(parts) != 7:
                    continue

                domain, _, cookie_path_value, secure, _, name, value = parts

                session.cookies.set(
                    name,
                    value,
                    domain=domain.lstrip("."),
                    path=cookie_path_value or "/",
                    secure=(secure.upper() == "TRUE"),
                )

        response = session.get(
            url,
            timeout=45,
            allow_redirects=True,
        )

        html = response.text or ""

        if response.status_code != 200:
            return (
                None,
                "facebook_story_http_error",
                f"HTTP {response.status_code}",
                502,
            )

        if len(html) < 10000:
            return (
                None,
                "facebook_story_payload_too_small",
                f"payload_bytes={len(html)}",
                502,
            )

        return html, None, "", 200

    except requests.RequestException as exc:
        return (
            None,
            "facebook_story_fetch_failed",
            str(exc),
            502,
        )

    finally:
        try:
            os.unlink(cookie_path)
        except OSError:
            pass


def is_facebook_story_url(value):
    try:
        parsed = urlparse(value)

        host = re.sub(
            r"^www\.",
            "",
            (parsed.hostname or "").lower(),
        )

        return (
            parsed.scheme == "https"
            and host in {
                "facebook.com",
                "m.facebook.com",
            }
            and parsed.path.startswith("/stories/")
        )
    except Exception:
        return False


@app.post("/facebook/story/extract")
def facebook_story_extract():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_facebook_story_url(url):
        return jsonify({
            "status": "error",
            "error": "invalid_facebook_story_url",
        }), 400

    html, error, detail, status_code = (
        fetch_facebook_story_html(url)
    )

    if error:
        return jsonify({
            "status": "error",
            "error": error,
            "detail": detail,
        }), status_code

    items = extract_facebook_story_photo_items(html)

    if not items:
        return jsonify({
            "status": "error",
            "error": "facebook_story_media_not_found",
        }), 422

    return jsonify({
        "status": "ok",
        "engine": "facebook-story-html",
        "item_count": len(items),
        "items": items,
    })


@app.post("/facebook/story/debug")
def facebook_story_debug():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_facebook_story_url(url):
        return jsonify({
            "status": "error",
            "error": "invalid_facebook_story_url",
        }), 400

    cmd = [
        "yt-dlp",
        "--no-download",
        "--no-warnings",
        "--dump-single-json",
        url,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return jsonify({
            "status": "error",
            "error": "facebook_story_extract_timeout",
        }), 504

    if result.returncode != 0:
        return jsonify({
            "status": "error",
            "error": "facebook_story_extract_failed",
            "detail": result.stderr[-2000:],
        }), 422

    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        return jsonify({
            "status": "error",
            "error": "facebook_story_invalid_response",
        }), 502

    entries = (
        info.get("entries")
        if isinstance(info, dict)
        else None
    )

    if not isinstance(entries, list):
        entries = []

    def summarize(item, index):
        if not isinstance(item, dict):
            return None

        media_url, ext = choose_media(item)

        return {
            "index": index,
            "id": str(item.get("id") or ""),
            "title": str(item.get("title") or "")[:120],
            "ext": ext,
            "has_media_url": bool(media_url),
            "webpage_url": str(
                item.get("webpage_url") or ""
            )[:300],
        }

    summarized = []

    for index, entry in enumerate(entries, 1):
        item = summarize(entry, index)

        if item:
            summarized.append(item)

    root_media_url, root_ext = choose_media(info)

    return jsonify({
        "status": "ok",
        "extractor": str(
            info.get("extractor") or ""
        ),
        "extractor_key": str(
            info.get("extractor_key") or ""
        ),
        "root_id": str(info.get("id") or ""),
        "root_ext": root_ext,
        "root_has_media_url": bool(root_media_url),
        "entry_count": len(entries),
        "entries": summarized,
    })



if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
