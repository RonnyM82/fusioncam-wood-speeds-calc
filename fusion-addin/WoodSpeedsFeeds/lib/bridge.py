"""Event plumbing: handler ownership, custom events, page messaging.

Three structural rules live here, built in from the first line because
retrofitting them means rewriting the plumbing (plan, 2026-09-01).

1. The Fusion API is called only from the main thread. A background
   thread re-enters through app.fireCustomEvent, the one documented
   cross-thread entry point. The registered handler then runs on the
   main thread.
2. Every handler instance is appended to the module-level _handlers
   list. Python garbage-collects an unreferenced handler and the
   add-in silently goes deaf.
3. cleanup() unregisters every custom event, disconnects every
   recorded event connection and clears the handler list, so an
   add-in reload does not leak.
"""

import json

import adsk.core

from . import constants, log

# Rule 2: every handler the add-in creates lives here until stop().
_handlers = []

# Every registered custom event, as (event_id, event, handler), so
# cleanup() can unregister all of them.
_custom_events = []

# Every event connection made through connect(), as (event, handler),
# so cleanup() can disconnect them before the handler list clears
# (review finding, 2026-09-01).
_connections = []


def keep(handler):
    """Own a handler for the life of the add-in. Returns the handler."""
    _handlers.append(handler)
    return handler


def connect(event, handler):
    """Connect a handler to an event and record the pair for cleanup.

    cleanup() calls event.remove(handler) for every recorded pair, so
    stop() disconnects what run() connected (review finding,
    2026-09-01). Returns the handler.
    """
    event.add(handler)
    _connections.append((event, handler))
    return handler


def make_handler(base_class, callback, context):
    """Build a handler whose notify wraps the callback in try/except.

    Fusion swallows an exception that escapes a handler. This factory
    guarantees every handler logs its own failures (rule from the
    plan, 2026-09-01). The handler is kept automatically.
    """

    class _Handler(base_class):
        def notify(self, args):
            try:
                callback(args)
            except Exception:
                log.log_exception(context)

    return keep(_Handler())


def register_custom_event(app, event_id, callback):
    """Register a custom event and connect a guarded handler.

    A crashed earlier session can leave the event registered, so this
    unregisters first.
    """
    try:
        app.unregisterCustomEvent(event_id)
    except Exception:
        pass
    event = app.registerCustomEvent(event_id)
    handler = make_handler(
        adsk.core.CustomEventHandler, callback, "custom event " + event_id
    )
    event.add(handler)
    _custom_events.append((event_id, event, handler))
    return event


def fire(app, event_id, payload=""):
    """Fire a custom event. Safe to call from a background thread.

    This is the only add-in function a background thread may call.
    The call is wrapped and logged (review finding, 2026-09-01): file
    appends are safe off the main thread, so a dead re-entry path
    leaves a trace instead of failing silently.
    """
    try:
        app.fireCustomEvent(event_id, payload)
    except Exception:
        log.log_exception("bridge.fire " + str(event_id))


def send_to_page(palette, message_type, fields):
    """Send one protocol message to the panel page.

    Adds the envelope fields the protocol requires. Main thread only:
    call it from a handler, never from a background thread.
    """
    envelope = {"protocol": constants.PROTOCOL_VERSION, "type": message_type}
    envelope.update(fields)
    palette.sendInfoToHTML(message_type, json.dumps(envelope))
    log.log("sent " + message_type)


def cleanup(app):
    """Unregister events, disconnect connections, release handlers."""
    for event_id, event, handler in _custom_events:
        try:
            event.remove(handler)
        except Exception:
            pass
        try:
            app.unregisterCustomEvent(event_id)
        except Exception:
            pass
    _custom_events.clear()
    # Disconnect the recorded event connections before the handler
    # list clears (review finding, 2026-09-01), so a reload does not
    # leave a connected handler behind.
    for event, handler in _connections:
        try:
            event.remove(handler)
        except Exception:
            pass
    _connections.clear()
    _handlers.clear()
