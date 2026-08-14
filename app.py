"""FairCall Audit hackathon dashboard."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from anomaly import screen_anomalies, team_perspectives
from generate_demo_data import write_demo_files


INCIDENTS_PATH = Path("data/demo/incidents.csv")
PREDICTIONS_PATH = Path("outputs/predictions.json")
CONFIDENCE_THRESHOLD = 0.80

st.set_page_config(page_title="FairCall Audit", page_icon="⚖️", layout="wide")
st.markdown(
    """
    <style>
    .block-container {padding-top: 1.8rem; max-width: 1250px;}
    .muted {color: #64748b; font-size: 0.92rem;}
    .safety {padding: 1rem; border-left: 5px solid #0f766e;
             background: #ecfdf5; color: #134e4a; border-radius: 0.35rem;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def load_data() -> tuple[pd.DataFrame, list[dict]]:
    if not INCIDENTS_PATH.exists() or not PREDICTIONS_PATH.exists():
        write_demo_files(INCIDENTS_PATH, PREDICTIONS_PATH)
    return (
        pd.read_csv(INCIDENTS_PATH),
        json.loads(PREDICTIONS_PATH.read_text(encoding="utf-8")),
    )


def display_label(value: str) -> str:
    return value.replace("_", " ").title()


def incident_page(predictions: list[dict]) -> None:
    st.header("Incident review")
    st.caption("Each record displays its source; referee histories remain synthetic.")
    options = {record["incident_id"]: record for record in predictions}
    selected_id = st.selectbox("Incident", list(options))
    record = options[selected_id]
    st.caption(f"Data source: {record['data_origin']}")
    video_path = Path("clips") / selected_id / "view_1.mp4"
    left, right = st.columns([1.35, 1])
    with left:
        if video_path.exists():
            st.video(str(video_path))
        else:
            st.info(
                "No redistributable video is bundled. Place a permitted five-second clip at "
                f"`{video_path}` to display it here."
            )
        st.markdown(f"**Official decision:** {display_label(record['official_decision'])}")
    with right:
        frame = pd.DataFrame(
            {
                "decision": [display_label(key) for key in record["probabilities"]],
                "probability": list(record["probabilities"].values()),
            }
        )
        figure = px.bar(
            frame,
            x="probability",
            y="decision",
            orientation="h",
            range_x=[0, 1],
            color="probability",
            color_continuous_scale=["#cbd5e1", "#0f766e"],
        )
        figure.update_layout(
            coloraxis_showscale=False, height=310, margin=dict(l=0, r=0, t=10, b=0)
        )
        st.plotly_chart(figure, use_container_width=True)
    if record["accepted"]:
        st.success(f"Accepted for screening: {record['confidence']:.0%} confidence.")
    else:
        st.warning("Uncertain — excluded from anomaly analysis.")
    st.markdown(
        '<div class="safety"><b>Interpretation:</b> A model disagreement is not proof '
        "that the referee was wrong. It becomes an audit signal only after repeated "
        "directional disagreements and statistical screening.</div>",
        unsafe_allow_html=True,
    )


def monitoring_page(incidents: pd.DataFrame, results: pd.DataFrame) -> None:
    st.header("Referee monitoring")
    st.caption("Fictional referee histories, generated with fixed seed 42.")
    accepted = int((incidents["model_confidence"] >= CONFIDENCE_THRESHOLD).sum())
    col1, col2, col3 = st.columns(3)
    col1.metric("Incidents", f"{len(incidents):,}")
    col2.metric("Confident incidents", f"{accepted:,}")
    col3.metric("Audit signals", int(results["alert"].sum()))
    heatmap = results.pivot(index="referee_id", columns="team", values="anomaly_score").fillna(0)
    figure = px.imshow(
        heatmap,
        labels={"x": "Team", "y": "Referee", "color": "Anomaly score"},
        color_continuous_scale=["#f8fafc", "#f59e0b", "#991b1b"],
        aspect="auto",
    )
    figure.update_layout(height=430, margin=dict(l=0, r=0, t=25, b=0))
    st.plotly_chart(figure, use_container_width=True)
    display = results[
        ["referee_id", "team", "accepted_incidents", "disagreements", "favouring",
         "against", "favouring_share", "q_value", "status"]
    ].copy()
    display["favouring_share"] = display["favouring_share"].map(lambda value: f"{value:.0%}")
    display["q_value"] = display["q_value"].map(lambda value: f"{value:.4g}")
    st.dataframe(display, hide_index=True, use_container_width=True)


def audit_page(incidents: pd.DataFrame, results: pd.DataFrame) -> None:
    st.header("Audit case")
    alerts = results.loc[results["alert"]].copy()
    candidates = alerts if not alerts.empty else results.head(1)
    labels = [f"{row.referee_id} / {row.team}" for row in candidates.itertuples()]
    referee, team = st.selectbox("Referee / team", labels).split(" / ")
    case = candidates.loc[
        (candidates["referee_id"] == referee) & (candidates["team"] == team)
    ].iloc[0]
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Accepted incidents", int(case["accepted_incidents"]))
    col2.metric("Disagreements", int(case["disagreements"]))
    col3.metric("Favouring", int(case["favouring"]))
    col4.metric("Against", int(case["against"]))
    if case["alert"]:
        st.error("Directional anomaly detected — independent audit recommended.")
    else:
        st.info("This pair does not cross the screening threshold.")
    st.write(
        f"Among confident disagreements, **{case['favouring_share']:.0%}** favoured "
        f"**{team}**. Corrected q-value: **{case['q_value']:.4g}**."
    )
    perspectives = team_perspectives(incidents, CONFIDENCE_THRESHOLD)
    ids = perspectives.loc[
        (perspectives["referee_id"] == referee)
        & (perspectives["team"] == team)
        & (perspectives["direction"] != 0),
        ["incident_id", "direction"],
    ]
    details = incidents.merge(ids, on="incident_id", how="inner")
    details["direction"] = details["direction"].map({1: "Favours team", -1: "Against team"})
    st.subheader("Underlying disagreements")
    st.dataframe(
        details[["incident_id", "match_id", "official_decision", "model_decision",
                 "model_confidence", "direction"]],
        hide_index=True,
        use_container_width=True,
    )
    st.markdown(
        '<div class="safety"><b>Safety boundary:</b> This does not establish intent, '
        "misconduct, or corruption. First conduct blinded human video review and "
        "contextual statistical analysis.</div>",
        unsafe_allow_html=True,
    )


incidents_data, prediction_data = load_data()
screening_results = screen_anomalies(incidents_data, CONFIDENCE_THRESHOLD)
st.title("FairCall Audit")
st.markdown(
    '<p class="muted">AI-assisted screening for repeated directional officiating anomalies</p>',
    unsafe_allow_html=True,
)
page = st.sidebar.radio("View", ["Incident review", "Referee monitoring", "Audit case"])
st.sidebar.markdown("---")
st.sidebar.caption(
    "Video model: SoccerNet VARS\n\nAudit engine: hackathon prototype\n\n"
    "Referee histories: synthetic"
)
if page == "Incident review":
    incident_page(prediction_data)
elif page == "Referee monitoring":
    monitoring_page(incidents_data, screening_results)
else:
    audit_page(incidents_data, screening_results)
