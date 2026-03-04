import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import BarChartOne from "../../components/charts/bar/BarChartOne";
import PageMeta from "../../components/common/PageMeta";

export default function BarChart() {
  return (
    <div>
      <PageMeta
        title="Métricas - Ocupación | Colas Turnos"
        description="Gráfico de ocupación"
      />
      <PageBreadcrumb pageTitle="Ocupación" />
      <div className="space-y-6">
        <ComponentCard title="Ocupación (ejemplo)">
          <BarChartOne />
        </ComponentCard>
      </div>
    </div>
  );
}
