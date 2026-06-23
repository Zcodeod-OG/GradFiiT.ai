"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui/loading-placeholder";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithOAuthToken } = useAuth();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const dedupeKey = `gradfit_oauth_cb${search}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(dedupeKey)) {
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(dedupeKey, "1");
    }

    const err = searchParams.get("error");
    const message = searchParams.get("message");
    const token = searchParams.get("token");

    const finish = async () => {
      if (err) {
        toast.error(message || "Sign-in was cancelled or failed.");
        router.replace("/login");
        return;
      }
      if (!token) {
        toast.error("Missing sign-in token.");
        router.replace("/login");
        return;
      }
      try {
        await loginWithOAuthToken(token);
        toast.success("Signed in!");
        router.replace("/");
      } catch {
        toast.error("Could not finish sign-in.");
        router.replace("/login");
      }
    };

    void finish();
  }, [loginWithOAuthToken, router, searchParams]);

  return (
    <PageLoader
      title="Completing sign-in"
      subtitle="Hold on while we set up your account…"
    />
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<PageLoader title="Loading" />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
