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
          ? moment(issue.fields.resolutiondate)
          : null
      ),
      created: (
        issue.fields.created
          ? moment(issue.fields.created)
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
  console.log(issues);

  const momentRange = [];
  const endMoment = moment(end);
  let latestMoment = moment(start);
  while (latestMoment <= endMoment) {
    momentRange.push(latestMoment);
    latestMoment = latestMoment.add(1, "days");
  }
  console.log(momentRange);

  return [
    {
      x: [1, 2, 3],
      y: [2, 6, 3],
      type: 'scatter',
      mode: 'lines+markers',
      marker: {color: 'red'},
    },
    {type: 'bar', x: [1, 2, 3], y: [2, 5, 3]},
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
