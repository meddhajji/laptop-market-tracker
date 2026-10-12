"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BotMessageSquare, Github, LayoutDashboard } from "lucide-react";

const iconButton =
    "rounded-md p-2 border border-transparent transition-all duration-300 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] hover:backdrop-blur-md hover:border-black/5 dark:hover:border-white/10";

export function Navbar() {
    const pathname = usePathname();
    // Read from session storage on each render so the dashboard link brings
    // back the filters the visitor last used.
    const getStoredParams = (key: string) => {
        if (typeof window === "undefined") return "";
        const saved = sessionStorage.getItem(key);
        return saved ? "?" + saved : "";
    };

    const links = [
        { path: "/", href: "/" + (pathname !== "/" ? getStoredParams("dashboard_params") : ""), label: "Dashboard", icon: LayoutDashboard },
        { path: "/assistant", href: "/assistant", label: "AI assistant", icon: BotMessageSquare },
    ];

    return (
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-1">
                    {links.map(({ path, href, label, icon: Icon }) => (
                        <Link
                            key={path}
                            href={href}
                            aria-label={label}
                            title={label}
                            aria-current={pathname === path ? "page" : undefined}
                            suppressHydrationWarning
                            className={cn(
                                iconButton,
                                pathname === path
                                    ? "bg-zinc-900/10 dark:bg-white/15 text-zinc-900 dark:text-zinc-100 shadow-sm backdrop-blur-md border-black/5 dark:border-white/10"
                                    : "text-muted-foreground"
                            )}
                        >
                            <Icon className="size-[18px]" />
                        </Link>
                    ))}
                </div>
                <a
                    href="https://github.com/meddhajji/laptop-market-tracker"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Source code on GitHub"
                    title="Source code on GitHub"
                    className={cn(iconButton, "text-muted-foreground")}
                >
                    <Github className="size-[18px]" />
                </a>
            </nav>
        </header>
    );
}
