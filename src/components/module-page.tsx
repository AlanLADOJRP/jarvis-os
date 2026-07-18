import { ModulePlaceholder } from "@/components/module-placeholder";

export function ModulePage({
  title,
  description,
  primaryHref,
  primaryLabel,
}: {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return <ModulePlaceholder title={title} description={description} primaryHref={primaryHref} primaryLabel={primaryLabel} />;
}
