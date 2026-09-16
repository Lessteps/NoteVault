"""
Spreadsheet-style table: fixed header, grid lines, subtotal and total rows,
sorting by column inside each group, and CSV export.

Rows are dicts; each has a "_kind" of "data" (default), "group" (a heading
row), "subtotal" or "total". A model, not a widget per cell, so a year of
movements stays fast.
"""

import csv
from typing import Callable, Optional

from PySide6.QtCore import Qt, QAbstractTableModel, QModelIndex, Signal
from PySide6.QtGui import QColor, QFont, QBrush
from PySide6.QtWidgets import QTableView, QHeaderView, QAbstractItemView, QFileDialog

from ... import theme
from . import BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, UI_FONT


class Column:
    def __init__(self, key: str, title: str, width: int = 0, align=Qt.AlignLeft,
                 fmt: Optional[Callable] = None, colour: Optional[Callable] = None,
                 sort_key: Optional[Callable] = None):
        self.key, self.title, self.width, self.align = key, title, width, align
        self.fmt = fmt or (lambda v, _row: "" if v is None else str(v))
        self.colour = colour
        self.sort_key = sort_key


class SheetModel(QAbstractTableModel):
    def __init__(self, columns, parent=None):
        super().__init__(parent)
        self.columns = list(columns)
        self.rows: list = []
        self.sort_state: Optional[tuple] = None

    def set_rows(self, rows):
        self.beginResetModel()
        self.rows = list(rows)
        self.endResetModel()

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.rows)

    def columnCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.columns)

    def headerData(self, section, orientation, role=Qt.DisplayRole):
        if orientation == Qt.Horizontal and role == Qt.DisplayRole:
            arrow = ""
            if self.sort_state and self.sort_state[0] == section:
                arrow = "  ▼" if self.sort_state[1] else "  ▲"
            return self.columns[section].title + arrow
        if orientation == Qt.Horizontal and role == Qt.TextAlignmentRole:
            return int(self.columns[section].align | Qt.AlignVCenter)
        return None

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid():
            return None
        row = self.rows[index.row()]
        col = self.columns[index.column()]
        kind = row.get("_kind", "data")
        if role == Qt.DisplayRole:
            if kind == "group":
                return row.get("_label", "") if index.column() == 0 else ""
            return col.fmt(row.get(col.key), row)
        if role == Qt.TextAlignmentRole:
            return int(col.align | Qt.AlignVCenter)
        if role == Qt.ForegroundRole:
            colour = None
            if col.colour is not None and kind != "group":
                colour = col.colour(row.get(col.key), row)
            if colour is None:
                colour = {"group": TEXT, "subtotal": TEXT_DIM, "total": TEXT}.get(kind, TEXT)
            return QBrush(QColor(theme.tint(colour)))
        if role == Qt.BackgroundRole:
            bg = {"group": "#161616", "subtotal": "#1a1a1a", "total": "#202028"}.get(kind)
            if bg is None and row.get("_bg"):
                bg = row["_bg"]
            return QBrush(QColor(theme.tint(bg))) if bg else None
        if role == Qt.FontRole:
            f = QFont()
            f.setFamilies(["Segoe UI Variable Text", "Segoe UI"])
            f.setPixelSize(12)
            f.setBold(kind in ("group", "subtotal", "total"))
            return f
        if role == Qt.ToolTipRole:
            return row.get("_tooltip")
        if role == Qt.UserRole:
            return row
        return None


class SpreadsheetTable(QTableView):
    row_activated = Signal(dict)

    def __init__(self, columns, parent=None):
        super().__init__(parent)
        self.model_ = SheetModel(columns, self)
        self.setModel(self.model_)
        self._source_rows: list = []
        self._sort: Optional[tuple] = None
        self.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.setSelectionMode(QAbstractItemView.SingleSelection)
        self.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.setShowGrid(True)
        self.setAlternatingRowColors(False)
        self.setWordWrap(False)
        self.verticalHeader().setVisible(False)
        self.verticalHeader().setDefaultSectionSize(28)
        header = self.horizontalHeader()
        header.setHighlightSections(False)
        header.setSectionsClickable(True)
        header.sectionClicked.connect(self._sort_by)
        stretch_done = False
        for i, c in enumerate(columns):
            if c.width:
                header.setSectionResizeMode(i, QHeaderView.Interactive)
                self.setColumnWidth(i, c.width)
            elif not stretch_done:
                header.setSectionResizeMode(i, QHeaderView.Stretch)
                stretch_done = True
        self.doubleClicked.connect(self._activated)
        self.setStyleSheet(
            f"QTableView{{background:#1c1c1c;border:1px solid {BORDER};border-radius:8px;"
            f"gridline-color:{BORDER};color:{TEXT};font-size:12px;font-family:{UI_FONT};"
            "selection-background-color:rgba(35,131,226,0.25);selection-color:" + TEXT + ";}"
            f"QHeaderView::section{{background:#161616;color:{TEXT_DIM};border:none;"
            f"border-right:1px solid {BORDER};border-bottom:1px solid {BORDER};padding:6px 8px;"
            f"font-size:11px;font-weight:600;font-family:{UI_FONT};}}"
            "QTableCornerButton::section{background:#161616;border:none;}")

    def set_rows(self, rows):
        self._source_rows = list(rows)
        self._apply()

    def rows(self) -> list:
        return list(self.model_.rows)

    def _sort_by(self, section: int):
        col = self.model_.columns[section]
        if self._sort and self._sort[0] == section:
            self._sort = None if self._sort[1] else (section, True)
        else:
            self._sort = (section, False)
        self.model_.sort_state = self._sort
        self._apply()

    def _apply(self):
        rows = self._source_rows
        if self._sort:
            section, desc = self._sort
            col = self.model_.columns[section]
            key = col.sort_key or (lambda v: (v is None, v if not isinstance(v, str) else v.lower()))
            out, block = [], []

            def flush():
                block.sort(key=lambda r: key(r.get(col.key)), reverse=desc)
                out.extend(block)
                block.clear()

            for r in rows:
                if r.get("_kind", "data") == "data":
                    block.append(r)
                else:
                    flush()
                    out.append(r)
            flush()
            rows = out
        self.model_.set_rows(rows)
        self.clearSpans()
        for i, r in enumerate(rows):
            if r.get("_kind") == "group":
                self.setSpan(i, 0, 1, len(self.model_.columns))

    def _activated(self, index):
        row = self.model_.rows[index.row()]
        if row.get("_kind", "data") == "data":
            self.row_activated.emit(row)

    def export_csv(self, parent=None, suggested: str = "registro.csv") -> Optional[str]:
        path, _ = QFileDialog.getSaveFileName(parent or self, "Exportar CSV", suggested,
                                              "CSV (*.csv)")
        if not path:
            return None
        self.write_csv(path)
        return path

    def write_csv(self, path: str):
        cols = self.model_.columns
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.writer(fh, delimiter=";")
            writer.writerow([c.title for c in cols])
            for r in self.model_.rows:
                if r.get("_kind") == "group":
                    writer.writerow([r.get("_label", "")] + [""] * (len(cols) - 1))
                else:
                    writer.writerow([c.fmt(r.get(c.key), r) for c in cols])
