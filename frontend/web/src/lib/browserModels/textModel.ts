export default {
  id: "aliyunBailianQwenText",
  label: "阿里云百炼（Qwen 文本模型）",
  version: "2.0.0",
  apiUrl: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  protocol: "openai-completions",
  readme: "使用阿里云百炼 OpenAI 兼容接口。请在供应商配置中填写 API Key。当前接入模型：qwen3.8-flash。模型接口示例使用 enable_thinking=true；是否能由 AFXEN 的通用文本调用自动传入该参数，取决于宿主的 OpenAI 兼容协议实现。",
  rules: [
    {
      type: "input",
      field: "apiKey",
      title: "API Key",
      value: "",
      props: {
        type: "password",
        showPassword: true,
        autocomplete: "off"
      }
    }
  ],
  models: [
    {
      id: "qwen3.8-flash",
      label: "Qwen3.8 Flash",
      type: "text",
      think: true
    }
  ]
};
