import { use, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "react-router";
import axios from "axios";
import moment from "moment";
import Plot from 'react-plotly.js';
import type { Route } from "./+types/burnup";

export function meta({ location }: Route.MetaArgs) {
  const searchParams = new URLSearchParams(location.search);
  return [
    { title: `${searchParams.get("title")} - Stay on Target!` },
  ];
}

const fetchIssuesByJQL = async (jiraAuth, jql, estimateField, estimateToDays) => {
  const axiosInstance = axios.create({
    baseURL: `https://${jiraAuth.domain}/rest/api/3/`,
    headers: {
      "Content-Type": "application/json",
    },
    auth: {
      username: jiraAuth.username,
      password: jiraAuth.token,
    },
  });

  let issues = [];
  let nextPageToken = undefined;
  do {
    const response = await axiosInstance.post("search", {
      nextPageToken: nextPageToken,
      jql: jql,
      maxResults: 5000,
      fields: [
        "created",
        "resolutiondate",
        estimateField,
      ],
    });

    issues = issues.concat(response.data.issues);
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return issues
    .map((issue) => ({
      key: issue.key,
      estimateDays: issue.fields[estimateField] * estimateToDays,
      resolved: (
        issue.fields.resolutiondate
          ? moment(issue.fields.resolutiondate).startOf("day")
          : null
      ),
      created: (
        issue.fields.created
          ? moment(issue.fields.created).startOf("day")
          : null
      ),
    }))
    .filter((issue) => issue.estimateDays > 0);
};

async function loadBurnupData(searchParams) {
  const title = searchParams.get("title");
  const jql = searchParams.get("jql");
  const estimateField = searchParams.get("estimateField");
  const estimateToDays = Number(searchParams.get("estimateToDays"));
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const jiraAuth = JSON.parse(window.localStorage.getItem("jiraAuth") || "{}");

  // Redirect to index page if we are missing any configuration (but
  // keep query params to populate configuration form).
  if (
    !title || !jql || !estimateField || !estimateToDays ||
    !jiraAuth.domain || !jiraAuth.username || !jiraAuth.token ||
    !start || !end
  ) {
    alert("Missing configuration, redirecting back to configuration form.");
    window.location = "/?" + searchParams.toString();
  }

  const issues = await fetchIssuesByJQL(jiraAuth, jql, estimateField, estimateToDays);
  const resolvedIssues = issues.filter((issue) => issue.resolved);

  const todayMoment = moment().startOf("day");
  const startMoment = moment(start).startOf("day");
  const endMoment = moment(end).startOf("day");
  const elapsedDays = todayMoment.diff(startMoment, "days");

  const initialScope = issues.filter(issue => issue.created <= startMoment).reduce((total, issue) => total + issue.estimateDays, 0);
  const initialResolved = resolvedIssues.filter(issue => issue.resolved <= startMoment).reduce((total, issue) => total + issue.estimateDays, 0);
  const totalScope = issues.reduce((total, issue) => total + issue.estimateDays, 0);
  const totalResolved = resolvedIssues.reduce((total, issue) => total + issue.estimateDays, 0);

  const scopeRate = (totalScope - initialScope) / elapsedDays;
  const resolvedRate = (totalResolved - initialResolved) / elapsedDays;

  const timeline = [];
  const issuesQueue = issues.sort((a, b) => a.created.diff(b.created));
  const resolvedIssuesQueue = resolvedIssues.sort((a, b) => a.resolved.diff(b.resolved));
  let currentMoment = startMoment;
  let currentScopeDays = 0;
  let currentResolvedDays = 0;
  let previousDayFullyResolved = false;
  while (currentMoment <= endMoment) {
    let todayRelDays = currentMoment.diff(todayMoment, "days");

    while (true) {
      if (issuesQueue.length === 0 || issuesQueue[0].created > currentMoment) {
        break;
      }
      let issue = issuesQueue.shift();
      currentScopeDays += issue.estimateDays;
    }

    while (true) {
      if (resolvedIssuesQueue.length === 0 || resolvedIssuesQueue[0].resolved > currentMoment) {
        break;
      }
      let issue = resolvedIssuesQueue.shift();
      currentResolvedDays += issue.estimateDays;
    }

    let projectedScopeDays = currentScopeDays + (todayRelDays * scopeRate);
    let projectedResolvedDays = currentResolvedDays + (todayRelDays * resolvedRate);
    let fullyResolved = projectedResolvedDays >= projectedScopeDays
    timeline.push({
      moment: currentMoment,
      scopeDays: (todayRelDays <= 0) ? currentScopeDays : null,
      projectedScopeDays: (todayRelDays >= 0 && !(fullyResolved && previousDayFullyResolved)) ? projectedScopeDays : null,
      resolvedDays: (todayRelDays <= 0) ? currentResolvedDays : null,
      projectedResolvedDays: (todayRelDays >= 0 && !(fullyResolved && previousDayFullyResolved)) ? Math.min(projectedResolvedDays, projectedScopeDays) : null,
    });

    previousDayFullyResolved = fullyResolved;
    currentMoment = moment(currentMoment).add(1, "days");
  }

  let projectedCompleted = "Never";
  if (totalResolved >= totalScope) {
    projectedCompleted = "Direct Hit";
  }
  else if (resolvedRate > scopeRate) {
    const daysRemaining = Math.ceil((totalScope - totalResolved) / (resolvedRate - scopeRate));
    projectedCompleted = moment(todayMoment).add(daysRemaining, "days").format("MMM DD");
  }

  return { startMoment, endMoment, todayMoment, timeline, projectedCompleted };
}

function BurnupPlot({ burnupDataPromise }) {
  const { startMoment, endMoment, todayMoment, timeline, projectedCompleted } = use(burnupDataPromise);

  const maxY = Math.max(...timeline.map(step => Math.max(step.scopeDays || 0, step.resolvedDays || 0, step.projectedScopeDays || 0, step.projectedResolvedDays || 0)));
  const rangeY = [-1, maxY * 1.08];
  const weekCount = Math.floor(endMoment.diff(startMoment, "days") / 7);
  const desiredTicks = 5;
  const tickDays = Math.ceil(weekCount / desiredTicks) * 7;

  const xDates = timeline.map(step => step.moment.format("YYYY-MM-DD"));
  const lineWidth = 8;
  const markerSize = 15;
  const traces = [
    {
      x: [todayMoment.format("YYYY-MM-DD"), todayMoment.format("YYYY-MM-DD")],
      y: rangeY,
      type: 'scatter',
      mode: 'lines',
      name: "Today",
      line: {
        dash: "dot",
        color: "#916D00",
        width: 8,
      },
      hovertemplate: '<span style="text-transform: uppercase;">%{x}</span><extra></extra>',
    },
    {
      x: xDates,
      y: timeline.map(step => step.projectedScopeDays),
      type: 'scatter',
      mode: 'lines',
      name: "Est. Scope",
      line: {
        dash: "dashdot",
        color: "#FFBF00",
        width: lineWidth,
      },
      hovertemplate: '<span style="color: #FFBF00; text-transform: uppercase;">%{x} | Est. Scope: %{y:.0f} days</span><extra></extra>',
    },
    {
      x: xDates,
      y: timeline.map(step => step.scopeDays),
      type: 'scatter',
      mode: 'lines+markers',
      name: "Scope",
      line: {
        color: "#FFBF00",
        width: lineWidth,
      },
      marker: {
        size: markerSize,
      },
      hovertemplate: '<span style="color: #FFBF00; text-transform: uppercase;">%{x} | Scope: %{y:.0f} days</span><extra></extra>',
    },
    {
      x: xDates,
      y: timeline.map(step => step.projectedResolvedDays),
      type: 'scatter',
      mode: 'lines',
      name: "Est. Done",
      line: {
        dash: "dashdot",
        color: "#FF1500",
        width: lineWidth,
      },
      hovertemplate: '<span style="color: #FF1500; text-transform: uppercase;">%{x} | Est. Done: %{y:.0f} days</span><extra></extra>',
    },
    {
      x: xDates,
      y: timeline.map(step => step.resolvedDays),
      type: 'scatter',
      mode: 'lines+markers',
      name: "Done",
      line: {
        color: "#FF1500",
        width: lineWidth,
      },
      marker: {
        size: markerSize,
      },
      hovertemplate: '<span style="color: #FF1500; text-transform: uppercase;">%{x} | Done: %{y:.0f} days</span><extra></extra>',
    },
  ];

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <Plot
        data={traces}
        layout={{
          showlegend: false,
          theme: "plotly_dark",
          paper_bgcolor: "#0f0e0a",
          plot_bgcolor: "#0f0e0a",
          font: {
            family: "SceletAF, sans-serif",
            color: "#FF1500",
            size: 18,
          },
          margin: {
            t: 0,
            b: 50,
            l: 60,
            r: 0,
            pad: 10,
          },
          grid: {
          },
          hoverlabel: {
            bgcolor: "#0f0e0a",
            bordercolor: "white",
            font: {
              family: "News Gothic Bold",
              size: 18,
              textcase: "upper",
              color: "white",
            },
          },
          xaxis: {
            tickformat: "%b %d",
            tickmode: "linear",
            tick0: startMoment.format("YYYY-MM-DD"),
            dtick: tickDays * 24 * 60 * 60 * 1000, // milliseconds
            tickfont: {
              family: "News Gothic Bold",
              color: "#FFBF00",
              textcase: "upper",
            },
            zeroline: false,
            gridcolor: "#916D00",
            gridwidth: 1,
            range: [startMoment.format("YYYY-MM-DD"), endMoment.format("YYYY-MM-DD")],
          },
          yaxis: {
            hoverformat: ".0f",
            zeroline: false,
            gridcolor: "#916D00",
            gridwidth: 1,
            range: rangeY,
            tick0: 0,
            dtick: tickDays,
          },
        }}
        config={ {
          responsive: true,
          modeBarButtonsToRemove: ["zoom2d", "pan2d", "select2d", "lasso2d", "zoomin2d", "zoomout2d", "autoScale2d"],
        } }
        style={ {width: "100%", height: "100%"} }
      />
      <div style={{ display: "flex", fontSize: "2.5em", alignItems: "center" }}>
        <div style={{ paddingTop: "0.2em" }}>
          <span style={{ color: "#FFBF00" }}>Scope</span>&nbsp;/&nbsp;
          <span style={{ color: "#FF1500" }}>Done</span>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ color: "#FFBF00", marginRight: "0.5em", paddingTop: "0.2em" }}>Est. Target: </div>
        <div style={{ color: "#FF1500", border: "2px solid #FFBF00", padding: "0.2em", paddingBottom: "0", borderRadius: "0.4em"}}>{projectedCompleted}</div>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <p style={{ fontSize: "2em", color: "#FF1500" }}>Targeting...</p>
    </div>
  );
}

export default function BurnupPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const title = searchParams.get("title");

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px", boxSizing: "border-box" }}>
      <a href={`/?${searchParams}`} style={{ textDecoration: "none" }}><h1 style={{ color: "#FF1500", margin: "0.2em 0", fontSize: "3em", textAlign: "center" }}>{title}</h1></a>
      <Suspense fallback={<Loading />}>
        <BurnupPlot burnupDataPromise={loadBurnupData(searchParams)} />
      </Suspense>
    </main>
  );
}
