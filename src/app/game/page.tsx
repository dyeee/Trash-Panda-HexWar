"use client";
// ============================================================
// src/app/game/page.tsx — 遊戲頁（輕量版）
// ============================================================
import { useEffect, useState } from "react";
import { useRouter }           from "next/navigation";
import GameBoard               from "@/components/game/GameBoard";
import { Player }              from "@/types";

export default function GamePage() {
  const router = useRouter();
  const [names, setNames] = useState<{ blue: string; red: string } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("hexwar:session");
    if (!raw) { router.replace("/"); return; }
    try {
      const { blueName, redName } = JSON.parse(raw);
      if (!blueName || !redName) { router.replace("/"); return; }
      setNames({ blue: blueName, red: redName });
    } catch {
      router.replace("/");
    }
  }, [router]);

  if (!names) return null;

  return (
    <GameBoard
      blueName={names.blue}
      redName={names.red}
      onGameEnd={() => {
        sessionStorage.removeItem("hexwar:session");
      }}
    />
  );
}
