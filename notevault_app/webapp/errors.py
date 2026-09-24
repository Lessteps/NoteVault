"""The one exception the bridge raises on purpose."""


class ApiError(ValueError):
    """A request the API refuses; the message is shown to the user."""
