export async function submitRun(data) {
  try {
    const response = await fetch("sim/api/submitRun.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return response.ok;
  } catch (err) {
    console.error("Submission failed:", err);
    return false;
  }
}
