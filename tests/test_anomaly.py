import pandas as pd

from anomaly import screen_anomalies, team_perspectives
from generate_demo_data import build_rows


def demo_incidents() -> pd.DataFrame:
    return pd.DataFrame(build_rows())


def test_synthetic_pattern_flags_only_expected_case():
    results = screen_anomalies(demo_incidents())
    alerts = results.loc[results["alert"], ["referee_id", "team"]]
    assert (alerts == ["R04", "Blue"]).all(axis=1).any()
    assert len(alerts) == 1


def test_low_confidence_incident_is_excluded():
    incidents = pd.DataFrame(
        [{
            "incident_id": "low",
            "match_id": "match",
            "referee_id": "R01",
            "offending_team": "Blue",
            "opponent_team": "Red",
            "official_decision": "no_offence",
            "model_decision": "yellow",
            "model_confidence": 0.79,
        }]
    )
    assert team_perspectives(incidents, confidence_threshold=0.80).empty


def test_lenient_decision_favours_offending_team():
    incidents = pd.DataFrame(
        [{
            "incident_id": "one",
            "match_id": "match",
            "referee_id": "R01",
            "offending_team": "Blue",
            "opponent_team": "Red",
            "official_decision": "foul_no_card",
            "model_decision": "yellow",
            "model_confidence": 0.95,
        }]
    )
    perspectives = team_perspectives(incidents)
    blue = perspectives.loc[perspectives["team"] == "Blue"].iloc[0]
    red = perspectives.loc[perspectives["team"] == "Red"].iloc[0]
    assert blue["direction"] == 1
    assert red["direction"] == -1
