from unittest.mock import MagicMock, patch

from spaa.services.worker_manager import WorkerManager


def test_worker_manager_initial_state():
    mgr = WorkerManager()
    assert mgr.is_running is False
    status = mgr.get_status()
    assert status["is_running"] is False
    assert status["pid"] is None


def test_worker_manager_stop_when_not_running():
    mgr = WorkerManager()
    res = mgr.stop()
    assert res["success"] is True
    assert res["status"]["is_running"] is False


@patch("subprocess.Popen")
def test_worker_manager_start_and_stop(mock_popen):
    mock_process = MagicMock()
    mock_process.poll.return_value = None  # None means process is still alive
    mock_process.pid = 9999
    mock_popen.return_value = mock_process

    mgr = WorkerManager()
    start_res = mgr.start(speaker="Ryan", poll_interval=1.0)
    assert start_res["success"] is True
    assert mgr.is_running is True
    assert mgr.get_status()["pid"] == 9999

    # Calling start again while running returns already running
    start_again = mgr.start(speaker="Ryan")
    assert start_again["success"] is True
    assert "ya está en ejecución" in start_again["message"]

    # Now stop
    stop_res = mgr.stop()
    assert stop_res["success"] is True
    mock_process.terminate.assert_called_once()
    assert mgr.is_running is False
