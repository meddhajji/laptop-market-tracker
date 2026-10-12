"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Github, MessageCircle, Table2 } from "lucide-react";

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
        { path: "/", href: "/" + (pathname !== "/" ? getStoredParams("dashboard_params") : ""), label: "Laptops", icon: Table2 },
        { path: "/assistant", href: "/assistant", label: "AI Assistant", icon: MessageCircle },
    ];

    return (
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    {links.map(({ path, href, label, icon: Icon }) => (
                        <Link
                            key={path}
                            href={href}
                            aria-label={label}
                            title={label}
                            aria-current={pathname === path ? "page" : undefined}
                            suppressHydrationWarning
                            className={cn(
                                "p-2 transition-colors duration-200",
                                pathname === path ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground"
                            )}
                        >
                            <Icon className="size-5" strokeWidth={1.75} />
                        </Link>
                    ))}
                </div>
                <a
                    href="https://github.com/meddhajji/laptop-market-tracker"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Source code on GitHub"
                    title="Source code on GitHub"
                    className="p-2 text-muted-foreground/50 transition-colors duration-200 hover:text-foreground"
                >
                    <Github className="size-5" strokeWidth={1.75} />
                </a>
            </nav>
        </header>
    );
}
