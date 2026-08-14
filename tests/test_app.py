from streamlit.testing.v1 import AppTest
from pathlib import Path



def test_all_dashboard_views_render_without_exceptions():
    app_path = Path(__file__).resolve().parents[1] / "app.py"
    app = AppTest.from_file(app_path).run(timeout=30)
    assert not app.exception
    assert app.title[0].value == "FairCall Audit"

    app.sidebar.radio[0].set_value("Referee monitoring").run(timeout=30)
    assert not app.exception
    assert app.header[0].value == "Referee monitoring"

    app.sidebar.radio[0].set_value("Audit case").run(timeout=30)
    assert not app.exception
    assert app.header[0].value == "Audit case"
    assert any("independent audit recommended" in item.value.lower() for item in app.error)
