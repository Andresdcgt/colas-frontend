import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  GroupIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  TableIcon,
  UserCircleIcon,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const metricasItem: NavItem = {
  icon: <PieChartIcon />,
  name: "Métricas",
  subItems: [
    { name: "Turnos por día", path: "/line-chart", pro: false },
    { name: "Ocupación", path: "/bar-chart", pro: false },
  ],
};

const perfilItem: NavItem = {
  icon: <UserCircleIcon />,
  name: "Perfil",
  path: "/profile",
};

const rootMenuSections: NavSection[] = [
  {
    title: "General",
    items: [{ icon: <GridIcon />, name: "Dashboard", path: "/" }],
  },
  {
    title: "Administración",
    items: [
      { icon: <GroupIcon />, name: "Clínicas y Hospitales", path: "/clinicas" },
      { icon: <UserCircleIcon />, name: "Usuarios", path: "/usuarios" },
      { icon: <BoxCubeIcon />, name: "Sucursales", path: "/sucursales" },
      { icon: <TableIcon />, name: "Consultorios", path: "/consultorios" },
      { icon: <UserCircleIcon />, name: "Médicos", path: "/medicos" },
    ],
  },
  {
    title: "Turnos",
    items: [
      { icon: <CalenderIcon />, name: "Agenda", path: "/calendar" },
      { icon: <TableIcon />, name: "Pacientes", path: "/basic-tables" },
      { icon: <ListIcon />, name: "Nuevo turno", path: "/form-elements" },
      { icon: <PageIcon />, name: "Vista médico", path: "/vista-medico" },
      { icon: <PageIcon />, name: "Pantalla de espera", path: "/blank" },
    ],
  },
  {
    title: "Reportes",
    items: [metricasItem],
  },
  {
    title: "Cuenta",
    items: [perfilItem],
  },
];

const adminClinicaMenuSections: NavSection[] = [
  {
    title: "General",
    items: [{ icon: <GridIcon />, name: "Dashboard", path: "/" }],
  },
  {
    title: "Administración",
    items: [
      { icon: <UserCircleIcon />, name: "Usuarios", path: "/usuarios" },
      { icon: <BoxCubeIcon />, name: "Sucursales", path: "/sucursales" },
      { icon: <TableIcon />, name: "Consultorios", path: "/consultorios" },
      { icon: <UserCircleIcon />, name: "Médicos", path: "/medicos" },
    ],
  },
  {
    title: "Turnos",
    items: [
      { icon: <CalenderIcon />, name: "Agenda", path: "/calendar" },
      { icon: <TableIcon />, name: "Pacientes", path: "/basic-tables" },
      { icon: <ListIcon />, name: "Nuevo turno", path: "/form-elements" },
      { icon: <PageIcon />, name: "Vista médico", path: "/vista-medico" },
      { icon: <PageIcon />, name: "Pantalla de espera", path: "/blank" },
    ],
  },
  {
    title: "Reportes",
    items: [metricasItem],
  },
  {
    title: "Cuenta",
    items: [perfilItem],
  },
];

const adminSucursalMenuSections: NavSection[] = [
  {
    title: "General",
    items: [{ icon: <GridIcon />, name: "Dashboard", path: "/" }],
  },
  {
    title: "Mi sucursal",
    items: [
      { icon: <UserCircleIcon />, name: "Usuarios", path: "/usuarios" },
      { icon: <TableIcon />, name: "Consultorios", path: "/consultorios" },
      { icon: <UserCircleIcon />, name: "Médicos", path: "/medicos" },
    ],
  },
  {
    title: "Turnos",
    items: [
      { icon: <CalenderIcon />, name: "Agenda", path: "/calendar" },
      { icon: <TableIcon />, name: "Pacientes", path: "/basic-tables" },
      { icon: <ListIcon />, name: "Nuevo turno", path: "/form-elements" },
      { icon: <PageIcon />, name: "Vista médico", path: "/vista-medico" },
      { icon: <PageIcon />, name: "Pantalla de espera", path: "/blank" },
    ],
  },
  {
    title: "Reportes",
    items: [metricasItem],
  },
  {
    title: "Cuenta",
    items: [perfilItem],
  },
];

const recepcionMenuSections: NavSection[] = [
  {
    title: "General",
    items: [{ icon: <GridIcon />, name: "Dashboard", path: "/" }],
  },
  {
    title: "Consulta",
    items: [
      { icon: <BoxCubeIcon />, name: "Sucursales", path: "/sucursales" },
      { icon: <TableIcon />, name: "Consultorios", path: "/consultorios" },
      { icon: <UserCircleIcon />, name: "Médicos", path: "/medicos" },
    ],
  },
  {
    title: "Turnos",
    items: [
      { icon: <CalenderIcon />, name: "Agenda", path: "/calendar" },
      { icon: <TableIcon />, name: "Pacientes", path: "/basic-tables" },
      { icon: <ListIcon />, name: "Nuevo turno", path: "/form-elements" },
      { icon: <PageIcon />, name: "Vista médico", path: "/vista-medico" },
      { icon: <PageIcon />, name: "Pantalla de espera", path: "/blank" },
    ],
  },
  {
    title: "Reportes",
    items: [metricasItem],
  },
  {
    title: "Cuenta",
    items: [perfilItem],
  },
];

const medicoMenuSections: NavSection[] = [
  {
    title: "General",
    items: [{ icon: <GridIcon />, name: "Dashboard", path: "/" }],
  },
  {
    title: "Atención",
    items: [
      { icon: <PageIcon />, name: "Vista médico", path: "/vista-medico" },
      { icon: <CalenderIcon />, name: "Agenda", path: "/calendar" },
      { icon: <TableIcon />, name: "Pacientes", path: "/basic-tables" },
    ],
  },
  {
    title: "Reportes",
    items: [metricasItem],
  },
  {
    title: "Cuenta",
    items: [perfilItem],
  },
];

function getMenuSections(role: string | undefined): NavSection[] {
  switch (role) {
    case "root":
      return rootMenuSections;
    case "admin_clinica":
      return adminClinicaMenuSections;
    case "admin_sucursal":
      return adminSucursalMenuSections;
    case "recepcion":
      return recepcionMenuSections;
    case "medico":
      return medicoMenuSections;
    default:
      return adminClinicaMenuSections.map((section) =>
        section.title === "Administración"
          ? {
              ...section,
              items: section.items.filter((item) => item.path !== "/usuarios"),
            }
          : section
      );
  }
}

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user } = useAuth();
  const location = useLocation();
  const menuSections = getMenuSections(user?.role);

  const [openSubmenu, setOpenSubmenu] = useState<{
    sectionIndex: number;
    itemIndex: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;

    menuSections.forEach((section, sectionIndex) => {
      section.items.forEach((nav, itemIndex) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({ sectionIndex, itemIndex });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive, menuSections]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.sectionIndex}-${openSubmenu.itemIndex}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (sectionIndex: number, itemIndex: number) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.sectionIndex === sectionIndex &&
        prevOpenSubmenu.itemIndex === itemIndex
      ) {
        return null;
      }
      return { sectionIndex, itemIndex };
    });
  };

  const renderMenuItems = (items: NavItem[], sectionIndex: number) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, itemIndex) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(sectionIndex, itemIndex)}
              className={`menu-item group ${
                openSubmenu?.sectionIndex === sectionIndex &&
                openSubmenu?.itemIndex === itemIndex
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.sectionIndex === sectionIndex &&
                  openSubmenu?.itemIndex === itemIndex
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.sectionIndex === sectionIndex &&
                    openSubmenu?.itemIndex === itemIndex
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${sectionIndex}-${itemIndex}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.sectionIndex === sectionIndex &&
                  openSubmenu?.itemIndex === itemIndex
                    ? `${subMenuHeight[`${sectionIndex}-${itemIndex}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link to="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <img
                className="dark:hidden"
                src="/images/logo/logo.svg"
                alt="Logo"
                width={150}
                height={40}
              />
              <img
                className="hidden dark:block"
                src="/images/logo/logo-dark.svg"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <img
              src="/images/logo/logo-icon.svg"
              alt="Logo"
              width={32}
              height={32}
            />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-6">
            {menuSections.map((section, sectionIndex) => (
              <div key={section.title}>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    section.title
                  ) : (
                    <HorizontaLDots className="size-6" />
                  )}
                </h2>
                {renderMenuItems(section.items, sectionIndex)}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
