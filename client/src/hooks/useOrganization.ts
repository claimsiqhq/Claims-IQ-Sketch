import { useState, useEffect, useCallback } from "react";
import { getMyOrganizations, switchOrganization, type Organization } from "@/lib/api";
import { useStore } from "@/lib/store";

export interface UseOrganizationResult {
  organizations: Organization[];
  currentOrgId: string | null;
  currentOrg: Organization | undefined;
  loadingOrgs: boolean;
  switchingOrg: boolean;
  handleSwitchOrg: (orgId: string) => Promise<void>;
}

export function useOrganization(): UseOrganizationResult {
  const authUser = useStore((state) => state.authUser);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [switchingOrg, setSwitchingOrg] = useState(false);

  // Load organizations on mount
  useEffect(() => {
    async function loadOrganizations() {
      try {
        const result = await getMyOrganizations();
        setOrganizations(result.organizations);
        setCurrentOrgId(result.currentOrganizationId || null);
      } catch (err) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoadingOrgs(false);
      }
    }
    if (authUser) {
      loadOrganizations();
    } else {
      setLoadingOrgs(false);
    }
  }, [authUser]);

  // Handle organization switch
  const handleSwitchOrg = useCallback(async (orgId: string) => {
    if (orgId === currentOrgId || switchingOrg) return;

    setSwitchingOrg(true);
    try {
      await switchOrganization(orgId);
      setCurrentOrgId(orgId);
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setSwitchingOrg(false);
    }
  }, [currentOrgId, switchingOrg]);

  const currentOrg = organizations.find(o => o.id === currentOrgId);

  return {
    organizations,
    currentOrgId,
    currentOrg,
    loadingOrgs,
    switchingOrg,
    handleSwitchOrg,
  };
}
