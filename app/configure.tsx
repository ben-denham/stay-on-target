import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import moment from "moment";
import type { Route } from "./+types/configure";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stay on Target!" },
  ];
}

export default function ConfigurePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedJiraAuth, setSavedJiraAuth] = useState({});

  useEffect(() => {
    setSavedJiraAuth(JSON.parse(window.localStorage.getItem("jiraAuth") || "{}"));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    const jiraDomain = e.target.elements.jiraDomain.value;
    const jiraUsername = e.target.elements.jiraUsername.value;
    const jiraToken = e.target.elements.jiraToken.value;
    const targetTitle = e.target.elements.targetTitle.value;
    const jqlQuery = e.target.elements.jqlQuery.value;
    const estimateField = e.target.elements.estimateField.value;
    const estimateToDays = e.target.elements.estimateToDays.value;
    const startDate = e.target.elements.startDate.value;
    const endDate = e.target.elements.endDate.value;

    if (
      !jiraDomain, !jiraUsername || !jiraToken ||
      !jqlQuery || !targetTitle || !estimateField || !estimateToDays ||
      !startDate || !endDate
    ) {
      alert("All fields are required.");
      return;
    }

    window.localStorage.setItem("jiraAuth", JSON.stringify({
      domain: jiraDomain,
      username: jiraUsername,
      token: jiraToken,
    }));
    navigate(`/burnup?title=${targetTitle}&jql=${jqlQuery}&estimateField=${estimateField}&estimateToDays=${estimateToDays}&start=${startDate}&end=${endDate}`)
  };

  return (
    <main id="configure-page">
      <form onSubmit={handleSubmit}>
        <div className="inputs-wrapper">
          <div>
            <label htmlFor="jiraDomain">Jira Domain:</label>
            <input id="jiraDomain" name="jiraDomain" defaultValue={savedJiraAuth.domain} required />
          </div>
          <div>
            <label htmlFor="jiraUsername">Jira Username:</label>
            <input id="jiraUsername" name="jiraUsername" defaultValue={savedJiraAuth.username} required />
          </div>
          <div>
            <label htmlFor="jiraToken"><a target="_blank" rel="noreferrer noopener" href="https://id.atlassian.com/manage-profile/security/api-tokens" style={{ textUnderlineOffset: "4px" }}>Jira API Token</a>:</label>
            <input type="password" autoComplete="off" id="jiraToken" name="jiraToken" defaultValue={savedJiraAuth.token} required />
          </div>
          <div>
            <label htmlFor="targetTitle">Target title:</label>
            <input id="targetTitle" name="targetTitle" defaultValue={searchParams.get("title")} required />
          </div>
          <div>
            <label htmlFor="jqlQuery">JQL Query:</label>
            <input id="jqlQuery" name="jqlQuery" defaultValue={searchParams.get("jql") || "project = \"TODO\""} required />
          </div>
          <div>
            <label htmlFor="estimateField">Estimate Field:</label>
            <input id="estimateField" name="estimateField" defaultValue={searchParams.get("estimateField")} required />
          </div>
          <div>
            <label htmlFor="estimateToDays">Days / Estimate:</label>
            <input type="number" id="estimateToDays" name="estimateToDays" defaultValue={searchParams.get("estimateToDays") || 1} required />
          </div>
          <div>
            <label htmlFor="startDate">Start Date:</label>
            <input type="date" id="startDate" name="startDate" defaultValue={searchParams.get("start")} required />
          </div>
          <div>
            <label htmlFor="endDate">End Date:</label>
            <input type="date" id="endDate" name="endDate" defaultValue={searchParams.get("end")} required />
          </div>
        </div>
        <div className="submit-wrapper">
          <button type="submit">Stay on Target</button>
        </div>
      </form>
    </main>
  );
}
