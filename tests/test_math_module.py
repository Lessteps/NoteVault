"""
Unit tests for Math tools and Math Graph Widget.
"""

import unittest
from notevault_app.core.math_tools import (
    evaluate_function, solve_quadratic, differentiate_polynomial,
    format_polynomial, matrix_det2x2, matrix_multiply
)


class TestMathModule(unittest.TestCase):
    def test_evaluate_function(self):
        val = evaluate_function("x**2 + 2*x + 1", 3.0)
        self.assertEqual(val, 16.0)

        sin_val = evaluate_function("sin(pi/2)", 0.0)
        self.assertAlmostEqual(sin_val, 1.0)

    def test_solve_quadratic(self):
        # x^2 - 5x + 6 = 0 -> roots 3, 2
        r1, r2 = solve_quadratic(1, -5, 6)
        self.assertEqual(sorted([r1, r2]), [2.0, 3.0])

        # No real roots
        r3, r4 = solve_quadratic(1, 0, 1)
        self.assertIsNone(r3)
        self.assertIsNone(r4)

    def test_differentiate_and_format_polynomial(self):
        # f(x) = 3x^3 + 2x^2 + 5x + 7
        terms = [(3.0, 3.0), (2.0, 2.0), (5.0, 1.0), (7.0, 0.0)]
        derived = differentiate_polynomial(terms)
        # f'(x) = 9x^2 + 4x + 5
        formatted = format_polynomial(derived)
        self.assertEqual(formatted, "9x^2 + 4x + 5")

    def test_matrices(self):
        # 2x2 determinant
        m = [[3.0, 8.0], [4.0, 6.0]]
        # 3*6 - 8*4 = 18 - 32 = -14
        self.assertEqual(matrix_det2x2(m), -14.0)

        # 2x2 multiplication
        a = [[1.0, 2.0], [3.0, 4.0]]
        b = [[2.0, 0.0], [1.0, 2.0]]
        # a x b = [[4, 4], [10, 8]]
        prod = matrix_multiply(a, b)
        self.assertEqual(prod, [[4.0, 4.0], [10.0, 8.0]])

    def test_graph_dialog_instantiation(self):
        from PySide6.QtWidgets import QApplication
        from notevault_app.ui.components.notes.math_graph_widget import MathGraphDialog
        _app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

        dlg = MathGraphDialog(initial_expr="x**2 - 4")
        self.assertEqual(dlg.canvas.expr, "x**2 - 4")
        dlg.expr_edit.setText("cos(x)")
        dlg._plot()
        self.assertEqual(dlg.canvas.expr, "cos(x)")


if __name__ == "__main__":
    unittest.main()
