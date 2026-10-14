
jest.mock("../src/utils/auditoriaHelper", () => ({
  registrarAuditoria: jest.fn().mockResolvedValue(undefined)
}));

const { registrarAuditoria } = require("../src/utils/auditoriaHelper");
const { autorizarRoles } = require("../src/middlewares/roleMiddleware");

describe("Middleware de autorización por roles", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = { usuario: {} };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  test("rechaza solicitudes sin usuario autenticado", async () => {
    req.usuario = undefined;

    await autorizarRoles("EDITAR_ROLES")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("permite al administrador", async () => {
    req.usuario = {
      id: 1,
      rol: "ADMINISTRADOR"
    };

    await autorizarRoles("EDITAR_ROLES")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("permite un permiso coincidente", async () => {
    req.usuario = {
      id: 2,
      rol: "ANALISTA",
      permisos: ["EDITAR_ROLES"]
    };

    await autorizarRoles("EDITAR_ROLES")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("rechaza permisos insuficientes con HTTP 403 y registra auditoría", async () => {
    req.usuario = {
      id_empresa: 1,
      id_usuario: 3,
      correo: "consulta@vrm.local",
      rol: "CONSULTA",
      permisos: []
    };

    req.method = "GET";
    req.originalUrl = "/api/roles";
    req.baseUrl = "/api/roles";
    req.route = { path: "/" };
    req.ip = "127.0.0.1";

    const advertencia = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    try {
      await autorizarRoles("EDITAR_ROLES")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Acceso denegado. Privilegios insuficientes."
      });
      expect(next).not.toHaveBeenCalled();

      expect(registrarAuditoria).toHaveBeenCalledWith(
        1,
        3,
        "PERMISSION_DENIED",
        "Seguridad",
        {
          metodo: "GET",
          ruta: "/api/roles",
          requeridos: ["EDITAR_ROLES"]
        },
        "127.0.0.1",
        expect.objectContaining({
          recurso: "endpoint",
          resultado: "DENEGADO"
        })
      );

      expect(advertencia).toHaveBeenCalledTimes(1);
    } finally {
      advertencia.mockRestore();
    }
  });

  test("rechaza a un usuario con permisos diferentes", async () => {
    req.usuario = {
      id_empresa: 1,
      id_usuario: 4,
      correo: "analista@vrm.local",
      rol: "ANALISTA",
      permisos: ["CONSULTAR_ACTIVOS"]
    };

    req.method = "GET";
    req.originalUrl = "/api/roles";
    req.baseUrl = "/api/roles";
    req.route = { path: "/" };
    req.ip = "127.0.0.1";

    const advertencia = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    try {
      await autorizarRoles("EDITAR_ROLES")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Acceso denegado. Privilegios insuficientes."
      });
      expect(next).not.toHaveBeenCalled();

      expect(registrarAuditoria).toHaveBeenCalledWith(
        1,
        4,
        "PERMISSION_DENIED",
        "Seguridad",
        {
          metodo: "GET",
          ruta: "/api/roles",
          requeridos: ["EDITAR_ROLES"]
        },
        "127.0.0.1",
        expect.objectContaining({
          recurso: "endpoint",
          resultado: "DENEGADO"
        })
      );

      expect(advertencia).toHaveBeenCalledTimes(1);
    } finally {
      advertencia.mockRestore();
    }
  });
});
