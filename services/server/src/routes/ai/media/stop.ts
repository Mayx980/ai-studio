import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ requestId: z.uuid() }), (req, res) => {
  res.json(success(u.mediaTasks.stop(req.body.requestId)));
});
