import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import LineChartOne from "../../components/charts/line/LineChartOne";
import PageMeta from "../../components/common/PageMeta";

export default function LineChart() {
  return (
    <>
      <PageMeta
        title="Métricas - Turnos por día | Colas Turnos"
        description="Gráfico de turnos por día"
      />
      <PageBreadcrumb pageTitle="Turnos por día" />
      <div className="space-y-6">
        <ComponentCard title="Turnos por día (ejemplo)">
          <LineChartOne />
        </ComponentCard>
      </div>
    </>
  );
}
