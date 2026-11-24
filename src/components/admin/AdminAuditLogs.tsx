import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { AuditLog } from '../../types/index.ts';

export function AdminAuditLogs({ logs }: { logs: AuditLog[] }) {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const perPage = 15;

  const entityTypes = ['ALL', ...Array.from(new Set(logs.map((l) => l.entityType)))];

  const filtered = logs.filter((l) => {
    const matchEntity = entityFilter === 'ALL' || l.entityType === entityFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      l.actorEmail.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q);
    return matchEntity && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Activity Audit Logs</h1>
        <p className="mt-1 text-xs text-[#9BA3B8]">
          Immutable record of administrative actions, order approvals, permission changes, and catalog updates.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search actor email, action, or summary..."
            className="w-full rounded-lg border border-white/10 bg-[#12131A] py-2 pl-9 pr-3 text-xs text-white focus:border-[#00F3FF] focus:outline-none"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-[#12131A] px-3 py-2 text-xs text-white"
        >
          {entityTypes.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131A]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[#9BA3B8]">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#9BA3B8]">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                paged.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-tabular text-[#9BA3B8] whitespace-nowrap">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white">{log.actorEmail}</td>
                    <td className="px-4 py-3 font-mono-tabular text-[#00F3FF]">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-[#9BA3B8]">
                      <div className="text-white">{log.summary}</div>
                      {(log.oldValue || log.newValue) && (
                        <div className="mt-0.5 text-[11px] text-[#9BA3B8]">
                          {log.oldValue && <span>From: {log.oldValue} </span>}
                          {log.newValue && <span>→ To: {log.newValue}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-[#9BA3B8]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
