const HR_EMPLOYEES_API_URL = "https://hr.briskolive.com/api/external/employees";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.HR_EMPLOYEES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing HR_EMPLOYEES_API_KEY environment variable." });
    }

    const response = await fetch(HR_EMPLOYEES_API_URL, {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HR employees API error:", response.status, errorText);
      return res.status(502).json({ error: "Failed to fetch employees from HR API." });
    }

    const data = await response.json();
    const rawEmployees = Array.isArray(data) ? data : data?.employees || data?.data || [];

    const employees = rawEmployees
      .filter((employee) => employee.is_current === true)
      .map((employee) => ({
        name: employee.name || employee.full_name || employee.employee_name || "",
        email: employee.email || employee.email_id || employee.work_email || "",
      }))
      .filter((employee) => employee.name || employee.email)
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({ employees });
  } catch (error) {
    console.error("hr-employees error:", error);
    return res.status(500).json({ error: "Failed to fetch employees." });
  }
}
