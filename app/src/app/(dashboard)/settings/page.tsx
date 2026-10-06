"use client";

import { useState } from "react";
import {
  Bell,
  Building2,
  Globe,
  Mail,
  Palette,
  Save,
  Ship,
  User as UserIcon,
  Weight,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import { useAppStore } from "@/store/useAppStore";
import { LOADING_PORTS, VESSEL_ORDER, type VesselClass } from "@/lib/reference/corridors";

const ROLES = ["Procurement Operator", "Procurement Analyst", "Risk Manager", "Executive"];

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const userRole = useAppStore((s) => s.userRole);
  const userName = useAppStore((s) => s.userName);
  const pushToast = useAppStore((s) => s.pushToast);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const [displayName, setDisplayName] = useState(userName || "Arnav Sharma");
  const [email, setEmail] = useState("chartering@steel-authority.in");
  const [role, setRole] = useState(ROLES.indexOf(userRole) >= 0 ? userRole : ROLES[1]);
  const [org, setOrg] = useState("Steel Authority of India Ltd. (SAIL) — Maritime Procurement");

  const toggle = (key: "notificationDigest" | "alertsEnabled") =>
    updateSettings({ [key]: !settings[key] });

  const inputClass =
    "h-10 w-full rounded-lg border border-line bg-panel px-3 text-[13px] text-primary placeholder:text-secondary/60 focus:border-accent focus:ring-1 focus:ring-accent/40 focus:outline-none";

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Profile, notification and default preferences for your OceanIQ workspace."
        right={
          <button
            onClick={() =>
              pushToast({ kind: "success", title: "Preferences saved", description: "Your workspace settings have been updated." })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-nav px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-blue-glow"
          >
            <Save className="size-4" /> Save changes
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Profile */}
        <ChartCard title="Profile" subtitle="Identity shown across the workspace">
          <div className="flex items-center gap-4 border-b border-line pb-4">
            <div className="grid size-14 place-items-center rounded-xl bg-accent/15 text-[18px] font-bold text-accent">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-[15px] font-semibold text-primary">{displayName}</div>
              <div className="text-[11px] text-secondary">{org}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
                <UserIcon className="size-3.5" /> Display name
              </label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
                <Mail className="size-3.5" /> Work email
              </label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
                <Building2 className="size-3.5" /> Organization
              </label>
              <input value={org} onChange={(e) => setOrg(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        </ChartCard>

        {/* Notifications */}
        <ChartCard title="Notifications" subtitle="Advisory and digest delivery preferences">
          <div className="space-y-2">
            <ToggleRow
              enabled={settings.alertsEnabled}
              onToggle={() => toggle("alertsEnabled")}
              icon={Bell}
              title="High-risk alerts"
              desc="Push freight volatility, congestion and weather advisories as they publish."
            />
            <ToggleRow
              enabled={settings.notificationDigest}
              onToggle={() => toggle("notificationDigest")}
              icon={Mail}
              title="Daily decision digest"
              desc="Morning summary of rates, alerts and recommendation deltas."
            />
          </div>
          <div className="mt-4 rounded-lg border border-line bg-panel p-3 text-[11.5px] leading-relaxed text-secondary">
            Demo note: alert delivery is simulated — toggle state is persisted in your browser session.
          </div>
        </ChartCard>

        {/* Locale & units */}
        <ChartCard title="Currency & Units" subtitle="Display conventions for cost figures">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
                <Globe className="size-3.5" /> Display currency
              </label>
              <select
                value={settings.currency}
                onChange={(e) => updateSettings({ currency: e.target.value as "USD" | "INR" })}
                className={inputClass}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
                <Weight className="size-3.5" /> Weight unit
              </label>
              <select
                value={settings.weightUnit}
                onChange={(e) => updateSettings({ weightUnit: e.target.value as "Tonnes" | "Metric Tonnes" })}
                className={inputClass}
              >
                <option>Tonnes</option>
                <option>Metric Tonnes</option>
              </select>
            </div>
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Default cargo
              </label>
              <input
                value={settings.defaultCargo}
                onChange={(e) => updateSettings({ defaultCargo: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Default destination port
              </label>
              <div className="relative">
                <Ship className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
                <select
                  value={settings.defaultDestinationPort}
                  onChange={(e) => updateSettings({ defaultDestinationPort: e.target.value })}
                  className={`${inputClass} pl-9`}
                >
                  {LOADING_PORTS.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Default vessel
              </label>
              <select
                value={settings.defaultVessel}
                onChange={(e) => updateSettings({ defaultVessel: e.target.value })}
                className={inputClass}
              >
                  {VESSEL_ORDER.map((v: VesselClass) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </div>
          </div>
        </ChartCard>

        {/* Appearance */}
        <ChartCard title="Appearance" subtitle="Workspace theming">
          <div className="space-y-2">
            <ToggleRow
              enabled={theme === "light"}
              onToggle={toggleTheme}
              icon={Palette}
              title="Light mode"
              desc="Switch between the deep-navy blueprint theme and a light workspace."
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Swatch color="var(--color-navy)" label="Navy" />
            <Swatch color="var(--color-panel)" label="Panel" />
            <Swatch color="var(--color-card)" label="Card" />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ToggleRow({
  enabled,
  onToggle,
  icon: Icon,
  title,
  desc,
}: {
  enabled: boolean;
  onToggle: () => void;
  icon: typeof Bell;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-3">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-8 place-items-center rounded-md ${enabled ? "bg-accent/15 text-accent" : "bg-white/5 text-secondary"}`}>
          <Icon className="size-4" />
        </span>
        <div>
          <div className="text-[12.5px] font-medium text-primary">{title}</div>
          <div className="text-[10.5px] text-secondary">{desc}</div>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-line"}`}
        aria-pressed={enabled}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-primary transition-all ${enabled ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-panel p-3">
      <span className="size-8 rounded-md border border-white/10" style={{ background: color }} />
      <span className="text-[10px] text-secondary">{label}</span>
    </div>
  );
}