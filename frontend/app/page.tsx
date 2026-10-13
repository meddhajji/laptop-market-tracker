import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { fetchLaptops, fetchLastUpdate, type LaptopSearchParams } from "@/lib/laptops";
import LaptopDashboard from "./LaptopDashboard";

type SearchParams = Promise<LaptopSearchParams>;

const getCachedLaptops = unstable_cache(
    async (params: LaptopSearchParams) => fetchLaptops(params),
    ["laptops-default"],
    { revalidate: 120 } // 2 min
);

const getCachedStats = unstable_cache(
    fetchLastUpdate,
    ["pipeline-last-update"],
    { revalidate: 120 }
);

function isDefaultQuery(params: LaptopSearchParams) {
    const keys = Object.keys(params);
    if (keys.length === 0) return true;
    
    const allowed = ['page', 'sortBy', 'sortOrder', 'hide_sold'];
    for (const key of keys) {
        if (!allowed.includes(key)) return false;
    }
    
    if (params.page && params.page !== "0") return false;
    if (params.sortBy && params.sortBy !== "deal") return false;
    if (params.sortOrder && params.sortOrder !== "desc") return false;
    if (params.hide_sold && params.hide_sold !== "true") return false;
    
    return true;
}

function LaptopsSkeleton() {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar border-none outline-none">
            <div className="mx-auto max-w-[1100px] px-6 pt-1 pb-8">
                <div className="flex gap-2 items-center justify-center w-full mb-5">
                    <div className="h-9 flex-1 sm:max-w-[520px] bg-black/5 dark:bg-white/5 rounded animate-pulse"></div>
                    <div className="h-9 w-9 bg-black/5 dark:bg-white/5 rounded animate-pulse"></div>
                    <div className="h-9 w-24 bg-black/5 dark:bg-white/5 rounded animate-pulse"></div>
                    <div className="h-9 w-9 bg-black/5 dark:bg-white/5 rounded animate-pulse"></div>
                </div>
                <div className="h-[560px] bg-black/5 dark:bg-white/5 rounded-2xl border border-white/10 animate-pulse"></div>
            </div>
        </div>
    );
}

export default async function HomePage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;

    const dataPromise = isDefaultQuery(searchParams) 
        ? getCachedLaptops(searchParams) 
        : fetchLaptops(searchParams);

    const statsPromise = getCachedStats();

    return (
        <Suspense fallback={<LaptopsSkeleton />}>
            <LaptopDashboard dataPromise={dataPromise} statsPromise={statsPromise} />
        </Suspense>
    );
}

