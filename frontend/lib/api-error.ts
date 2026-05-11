import axios from "axios"

type ApiValidationError = { msg?: string }

type ApiErrorPayload = {
  detail?: string | ApiValidationError[]
  errors?: ApiValidationError[]
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Request failed"
): string => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    if (!error.response) {
      return "Server is waking up. This can take up to a minute on the first request — please try again."
    }

    const { data, status } = error.response

    if (typeof data?.detail === "string" && data.detail.trim().length > 0) {
      return data.detail
    }

    if (Array.isArray(data?.detail)) {
      const firstDetailMessage = data.detail.find(
        (item) => typeof item?.msg === "string"
      )?.msg
      if (firstDetailMessage) {
        return firstDetailMessage
      }
    }

    if (Array.isArray(data?.errors)) {
      const firstValidationMessage = data.errors.find(
        (item) => typeof item?.msg === "string"
      )?.msg
      if (firstValidationMessage) {
        return firstValidationMessage
      }
    }

    if (status === 401) {
      return "Incorrect email or password"
    }

    if (status >= 500) {
      return "Server error. Please try again in a moment."
    }
  }

  return fallback
}