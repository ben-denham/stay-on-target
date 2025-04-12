import { use, useEffect, useState, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router";
import axios from "axios";
import moment from "moment";
import Plot from 'react-plotly.js';
import type { Route } from "./+types/burnup";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stay on Target" },
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
    const response = await axiosInstance.get("search", null, { params: {
      nextPageToken: nextPageToken,
      jql: jql,
      maxResults: 5000,
      fields: [
        "created",
        "resolutiondate",
        estimateField,
      ],
    }});

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

async function loadPlotData(searchParams) {
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
    navigate("/?" + searchParams.toString());
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
    timeline.push({
      moment: currentMoment,
      scopeDays: (todayRelDays <= 0) ? currentScopeDays : null,
      projectedScopeDays: (todayRelDays >= 0) ? projectedScopeDays : null,
      resolvedDays: (todayRelDays <= 0) ? currentResolvedDays : null,
      projectedResolvedDays: (todayRelDays >= 0) ? Math.min(projectedResolvedDays, projectedScopeDays) : null,
    });

    if (projectedResolvedDays >= projectedScopeDays) {
      break;
    }
    currentMoment = moment(currentMoment).add(1, "days");
  }

  const xDates = timeline.map(step => step.moment.format("YYYY-MM-DD"));
  return [
    {
      x: xDates,
      y: timeline.map(step => step.projectedResolvedDays),
      type: 'scatter',
      mode: 'lines+markers',
      marker: {color: 'teal'},
    },
    {
      x: xDates,
      y: timeline.map(step => step.resolvedDays),
      type: 'scatter',
      mode: 'lines+markers',
      marker: {color: 'blue'},
    },
    {
      x: xDates,
      y: timeline.map(step => step.projectedScopeDays),
      type: 'scatter',
      mode: 'lines+markers',
      marker: {color: 'orange'},
    },
    {
      x: xDates,
      y: timeline.map(step => step.scopeDays),
      type: 'scatter',
      mode: 'lines+markers',
      marker: {color: 'red'},
    },
  ];
}

function BurnupPlot({ plotDataPromise }) {
  const plotData = use(plotDataPromise);
  return (
    <Plot
      data={plotData}
      config={ {responsive: true} }
      style={ {width: "100%", height: "100%"} }
    />
  )
}

function Loading() {
  return <p>Loading...</p>
}

export default function BurnupPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const title = searchParams.get("title");

  return (
    <main style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <h1>{title}</h1>
      <Suspense fallback={<Loading />}>
        <BurnupPlot plotDataPromise={loadPlotData(searchParams)} />
      </Suspense>
    </main>
  );
}
