"use client";

import { useEffect } from "react";

export default function VerifyRedirectPage() {
  useEffect(() => {
    const search = window.location.search || "";
    window.location.replace("/qr-statement/verification" + search);
  }, []);

  return null;
}
