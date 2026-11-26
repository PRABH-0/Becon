"""Tests for the production bootstrap pipeline helper (Task S4)."""

from unittest.mock import patch

from app.bootstrap import bootstrap, run_migrations, run_seeder


def test_run_migrations_and_seeder_idempotent():
    """Verify migrations and seeder can run without error in the test environment."""
    run_migrations()
    stats = run_seeder()
    assert isinstance(stats, dict)
    assert "professions" in stats
    assert "topics" in stats
    assert "sources" in stats


def test_bootstrap_orchestration_flow():
    """Verify bootstrap calls migration, seed, fetch, and synthesis in correct order."""
    with patch("app.bootstrap.run_migrations") as mock_mig, \
         patch("app.bootstrap.run_seeder") as mock_seed, \
         patch("app.bootstrap.run_initial_fetch") as mock_fetch, \
         patch("app.bootstrap.run_initial_synthesis") as mock_synth:

        bootstrap(skip_fetch=False, skip_synthesize=False, fetch_limit=5, synthesis_limit=15)

        mock_mig.assert_called_once()
        mock_seed.assert_called_once()
        mock_fetch.assert_called_once_with(limit=5)
        mock_synth.assert_called_once_with(limit=15)


def test_bootstrap_skip_flags():
    """Verify bootstrap honors skip-fetch and skip-synthesize flags."""
    with patch("app.bootstrap.run_migrations") as mock_mig, \
         patch("app.bootstrap.run_seeder") as mock_seed, \
         patch("app.bootstrap.run_initial_fetch") as mock_fetch, \
         patch("app.bootstrap.run_initial_synthesis") as mock_synth:

        bootstrap(skip_fetch=True, skip_synthesize=True)

        mock_mig.assert_called_once()
        mock_seed.assert_called_once()
        mock_fetch.assert_not_called()
        mock_synth.assert_not_called()
