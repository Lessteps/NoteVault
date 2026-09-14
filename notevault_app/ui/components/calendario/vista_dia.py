"""
Vista Día — the time grid for a single day.
"""

from .rejilla_horaria import TimeGridView


class VistaDia(TimeGridView):
    def __init__(self, schedule_mgr, parent=None):
        super().__init__(schedule_mgr, n_days=1, parent=parent)
