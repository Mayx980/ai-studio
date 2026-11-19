import axios from "axios";
import type { QuestionPort } from "@toonflow/tool-ask-user-ui/ports";

export function createQuestionPort(): QuestionPort {
  return {
    async answer(input) {
      try {
        const { data } = await axios.post(input.sessionId ? "/api/singleAgent/answer" : "/api/agent/answer", input, { headers: { "x-toonflow-workspace": "1" } });
        if (data.code !== 200) throw new Error(data.message || "提交回答失败");
        return data.data;
      } catch (error) {
        if (axios.isAxiosError(error)) throw new Error(error.response?.data?.message || error.message);
        throw error;
      }
    },
  };
}
