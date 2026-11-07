export function validate(schema) {
  return function validateBody(req, res, next) {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        if (!fields[key]) fields[key] = issue.message;
      }
      return res.status(400).json({ error: "Check the highlighted fields.", fields });
    }
    req.body = parsed.data;
    next();
  };
}
