import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", validateFields({ requestId: z.uuid() }, "query"), (req, res) => {
  res.json(success(u.mediaTasks.status(req.query.requestId as string)));
});
