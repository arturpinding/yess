"""Statistical screening for directional referee/model disagreements.

This module produces audit-prioritisation signals. It does not infer intent or
prove corruption. The binomial screen is intentionally simple for a hackathon;
a production model must control for match context and opportunity exposure.
"""

from __future__ import annotations

import math
from typing import Final

import pandas as pd
from scipy.stats import binomtest
from statsmodels.stats.multitest import multipletests


SEVERITY: Final[dict[str, int]] = {
    "no_offence": 0,
    "foul_no_card": 1,
    "yellow": 2,
    "red": 3,
}

REQUIRED_COLUMNS: Final[set[str]] = {
    "incident_id",
    "match_id",
    "referee_id",
    "offending_team",
    "opponent_team",
    "official_decision",
    "model_decision",
    "model_confidence",
}


def _validate_incidents(incidents: pd.DataFrame) -> None:
    missing = REQUIRED_COLUMNS.difference(incidents.columns)
    if missing:
        raise ValueError(f"Missing incident columns: {sorted(missing)}")
    labels = set(incidents["official_decision"]).union(incidents["model_decision"])
    unknown = labels.difference(SEVERITY)
    if unknown:
        raise ValueError(f"Unknown decision labels: {sorted(unknown)}")


def team_perspectives(
    incidents: pd.DataFrame, confidence_threshold: float = 0.80
) -> pd.DataFrame:
    """Expand each accepted incident into one row per involved team."""

    _validate_incidents(incidents)
    accepted = incidents.loc[
        incidents["model_confidence"] >= confidence_threshold
    ].copy()
    rows: list[dict[str, object]] = []
    for incident in accepted.itertuples(index=False):
        official = SEVERITY[incident.official_decision]
        predicted = SEVERITY[incident.model_decision]
        if official < predicted:
            offending_direction, opponent_direction = 1, -1
        elif official > predicted:
            offending_direction, opponent_direction = -1, 1
        else:
            offending_direction = opponent_direction = 0

        common = {
            "incident_id": incident.incident_id,
            "match_id": incident.match_id,
            "referee_id": incident.referee_id,
        }
        rows.append(
            {**common, "team": incident.offending_team, "direction": offending_direction}
        )
        rows.append(
            {**common, "team": incident.opponent_team, "direction": opponent_direction}
        )
    return pd.DataFrame(
        rows,
        columns=["incident_id", "match_id", "referee_id", "team", "direction"],
    )


def screen_anomalies(
    incidents: pd.DataFrame,
    confidence_threshold: float = 0.80,
    minimum_incidents: int = 30,
    minimum_disagreements: int = 10,
    minimum_favouring_share: float = 0.75,
    false_discovery_rate: float = 0.05,
) -> pd.DataFrame:
    """Return referee/team screening statistics with BH-corrected p-values."""

    perspectives = team_perspectives(incidents, confidence_threshold)
    if perspectives.empty:
        return pd.DataFrame()

    records: list[dict[str, object]] = []
    for (referee, team), group in perspectives.groupby(["referee_id", "team"]):
        favouring = int((group["direction"] == 1).sum())
        against = int((group["direction"] == -1).sum())
        disagreements = favouring + against
        favouring_share = favouring / disagreements if disagreements else 0.5
        p_value = (
            binomtest(favouring, disagreements, 0.5, alternative="greater").pvalue
            if disagreements
            else 1.0
        )
        records.append(
            {
                "referee_id": referee,
                "team": team,
                "accepted_incidents": int(len(group)),
                "disagreements": disagreements,
                "favouring": favouring,
                "against": against,
                "favouring_share": favouring_share,
                "p_value": p_value,
            }
        )

    result = pd.DataFrame(records)
    result["q_value"] = multipletests(
        result["p_value"].to_numpy(), method="fdr_bh"
    )[1]
    result["eligible"] = (
        (result["accepted_incidents"] >= minimum_incidents)
        & (result["disagreements"] >= minimum_disagreements)
    )
    result["alert"] = (
        result["eligible"]
        & (result["favouring_share"] >= minimum_favouring_share)
        & (result["q_value"] < false_discovery_rate)
    )
    result["anomaly_score"] = result.apply(
        lambda row: max(0.0, row.favouring_share - 0.5)
        * -math.log10(max(float(row.q_value), 1e-12)),
        axis=1,
    )
    result["status"] = result["alert"].map(
        {True: "Independent audit recommended", False: "No alert"}
    )
    return result.sort_values(
        ["alert", "anomaly_score", "accepted_incidents"], ascending=[False, False, False]
    ).reset_index(drop=True)
