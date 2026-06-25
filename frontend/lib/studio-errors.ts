import axios from "axios";

export type StudioErrorKind =
  | "sagemaker"
  | "no_images"
  | "timeout"
  | "quota"
  | "generic";

export type StudioErrorInfo = {
  kind: StudioErrorKind;
  message: string;
};

export function classifyStudioError(
  error: unknown,
  fallback = "Generation failed. Try again."
): StudioErrorInfo {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail =
      typeof error.response?.data?.detail === "string"
        ? error.response.data.detail
        : null;

    if (status === 429) {
      return {
        kind: "quota",
        message:
          detail ||
          "You've reached your plan limit for generations this period. Upgrade or try again later.",
      };
    }

    if (status === 502) {
      return {
        kind: "sagemaker",
        message:
          detail ||
          "The FLUX endpoint is unavailable right now. Wait a moment and retry.",
      };
    }

    if (error.code === "ECONNABORTED" || !error.response) {
      return {
        kind: "timeout",
        message:
          "The request timed out while the model was rendering. This often happens on a cold endpoint — try again.",
      };
    }

    if (
      detail &&
      /no images returned|no image returned/i.test(detail)
    ) {
      return {
        kind: "no_images",
        message:
          "Generation finished but no image came back. Check SageMaker logs or retry with a simpler prompt.",
      };
    }

    if (detail) {
      return { kind: "generic", message: detail };
    }
  }

  if (error instanceof Error) {
    if (/no images returned|no image returned/i.test(error.message)) {
      return {
        kind: "no_images",
        message:
          "Generation finished but no image came back. Check SageMaker logs or retry with a simpler prompt.",
      };
    }
    return { kind: "generic", message: error.message || fallback };
  }

  return { kind: "generic", message: fallback };
}
