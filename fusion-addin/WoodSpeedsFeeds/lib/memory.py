"""Stored user choices, carried without ever being read.

The page owns the meaning of both blobs. The add-in stores them
verbatim and returns them verbatim in the next job message (decision
A2, 2026-09-01). Document scope lives in a document attribute group.
User scope lives in one JSON file under the user application-data
folder. The add-in never parses either blob.
"""

import os
import sys

from . import constants, log


def user_file_path():
    """Return the path of the per-user blob file.

    Windows: %APPDATA%/wood-speeds-feeds/user.json.
    Mac: ~/Library/Application Support/wood-speeds-feeds/user.json.
    Anywhere else: ~/.config/wood-speeds-feeds/user.json.
    """
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser(
            "~/.config"
        )
    return os.path.join(base, constants.USER_DIR_NAME, constants.USER_FILE_NAME)


def read_user_blob():
    """Return the stored user blob string, or None when there is none."""
    try:
        path = user_file_path()
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        log.log_exception("memory.read_user_blob")
        return None


def write_user_blob(blob):
    """Store the user blob verbatim. Returns True on success."""
    try:
        path = user_file_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(blob)
        return True
    except Exception:
        log.log_exception("memory.write_user_blob")
        return False


def read_doc_blob(document):
    """Return the stored document blob string, or None."""
    try:
        if document is None:
            return None
        attribute = document.attributes.itemByName(
            constants.DOC_ATTR_GROUP, constants.DOC_ATTR_NAME
        )
        if attribute is None:
            return None
        return attribute.value
    except Exception:
        log.log_exception("memory.read_doc_blob")
        return None


def write_doc_blob(document, blob):
    """Store the document blob verbatim. Returns True on success.

    Attributes.add replaces an existing attribute with the same group
    and name, so this is a plain overwrite.
    """
    try:
        if document is None:
            return False
        document.attributes.add(
            constants.DOC_ATTR_GROUP, constants.DOC_ATTR_NAME, blob
        )
        return True
    except Exception:
        log.log_exception("memory.write_doc_blob")
        return False
