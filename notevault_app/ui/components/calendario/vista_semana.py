"""
Vista Semana — the time grid for Monday to Sunday.
"""

from .rejilla_horaria import TimeGridView


class VistaSemana(TimeGridView):
    def __init__(self, schedule_mgr, parent=None):
        super().__init__(schedule_mgr, n_days=7, parent=parent)
