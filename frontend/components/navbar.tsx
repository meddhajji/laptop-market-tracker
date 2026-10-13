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
            {/* The middle column is as wide as the page content (the table), so the
                title lines up with it; the dashboard lays its search row over the
                same column (see LaptopDashboard). */}
            <nav className="grid h-14 grid-cols-[minmax(5rem,1fr)_minmax(0,1052px)_minmax(5rem,1fr)] items-center px-4">
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
                                "p-2 transition-colors duration-200",
                                pathname === path ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground"
                            )}
                        >
                            <Icon className="size-5" strokeWidth={1.75} />
                        </Link>
                    ))}
                </div>
                <h1 className="flex -translate-y-[1.5px] justify-center text-2xl font-black tracking-tight lg:justify-start">
                    {pathname === "/assistant" ? "AI Assistant" : pathname === "/" ? (
                        <Link href="/" title="Reset all filters" className="transition-opacity hover:opacity-70">
                            Laptops
                        </Link>
                    ) : null}
                </h1>
                <a
                    href="https://github.com/meddhajji/laptop-market-tracker"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Source code on GitHub"
                    title="Source code on GitHub"
                    className="justify-self-end p-2 text-muted-foreground/50 transition-colors duration-200 hover:text-foreground"
                >
                    <Github className="size-5" strokeWidth={1.75} />
                </a>
            </nav>
        </header>
    );
}
