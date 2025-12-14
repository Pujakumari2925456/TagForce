import React, { useState } from "react";

function App() {
  const [tag, setTag] = useState("");
  const [limit, setLimit] = useState(10);
  const [minRating, setMinRating] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [id, setId] = useState("");  // Make sure it's always a string

const fetchQuestions = async () => {
  if (!tag || !id) {
    alert("Please enter both topic and contest ID");
    return;
  }

  setLoading(true);
  setQuestions([]);

  try {
    const numLimit = parseInt(limit);
    const numMinRating = parseInt(minRating);

    const res = await fetch(
      `http://127.0.0.1:8000/questions?tag=${tag}&contest_id=${id}&min_rating=${numMinRating}`
    );

    if (!res.ok) {
      throw new Error("No questions found or API error");
    }

    const data = await res.json();

    setQuestions(Array.isArray(data) ? data.slice(0, numLimit) : []);
  } catch (err) {
    alert(err.message);
  } finally {
    setLoading(false);
  }
};


  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Codeforces Topic Practice</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Enter topic (dp, trees, greedy)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          style={{ padding: "8px", marginRight: "10px" }}
        />
        <input
          type="number"
          placeholder="Enter contest ID"
          value={id || ""}  // Ensure controlled input
          onChange={(e) => setId(e.target.value)}
          style={{ padding: "8px", marginRight: "10px" }}
        />
        <input
          type="number"
          placeholder="Limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          style={{ padding: "8px", width: "60px", marginRight: "10px" }}
        />
        <input
          type="number"
          placeholder="Min Rating"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          style={{ padding: "8px", width: "80px", marginRight: "10px" }}
        />

        <button onClick={fetchQuestions} style={{ padding: "8px 15px" }}>
          Get Questions
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {questions.length > 0 ? (
        <div>
          <h2>Questions for "{tag}"</h2>
          <ul>
            {questions.map((q, index) => (
              <li key={index} style={{ marginBottom: "10px" }}>
                <a href={q.url} target="_blank" rel="noreferrer">
                  {q.name}
                </a>{" "}
                - Rating: {q.rating} - Tags: {q.tags.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : !loading ? (
        <p>No questions yet. Enter a topic and click Get Questions.</p>
      ) : null}
    </div>
  );
}

export default App;
