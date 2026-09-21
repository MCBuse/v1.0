"""Reviewed fit function from George's notebook; offline use only."""
import numpy as np
from scipy.optimize import minimize

def fit_constrained_logistic(X, y, C, monotonic_constraints, feature_names):
    """
    Fits a logistic regression by directly minimizing L2-regularized log-loss,
    the same objective sklearn's LogisticRegression(penalty='l2', C=C) uses --
    but allows bounding individual coefficients so their sign can be forced
    to match sound business logic when the data's own signal is too weak or
    noisy to trust on its own (see MONOTONIC_CONSTRAINTS above).

    Returns (intercept, coef_array).
    """
    n, p = X.shape

    def loss_and_grad(w):
        z = np.clip(X @ w[1:] + w[0], -30, 30)
        p_hat = 1 / (1 + np.exp(-z))
        eps = 1e-12
        loss = -np.sum(y * np.log(p_hat + eps) + (1 - y) * np.log(1 - p_hat + eps))
        loss += (1 / (2 * C)) * np.sum(w[1:] ** 2)
        grad_w = X.T @ (p_hat - y) + w[1:] / C
        grad_b = np.sum(p_hat - y)
        return loss, np.concatenate([[grad_b], grad_w])

    bounds = [(None, None)]  # intercept: unconstrained
    for name in feature_names:
        rule = monotonic_constraints.get(name)
        if rule == "max":
            bounds.append((None, 0))
        elif rule == "min":
            bounds.append((0, None))
        else:
            bounds.append((None, None))

    w0 = np.zeros(p + 1)
    result = minimize(loss_and_grad, w0, jac=True, method="L-BFGS-B", bounds=bounds)
    return result.x[0], result.x[1:]
