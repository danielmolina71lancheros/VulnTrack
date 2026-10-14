
const jwt = require("jsonwebtoken");

jest.mock("../src/config/db", () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) }
}));

const { verificarToken } = require("../src/middlewares/authMiddleware");

describe("Middleware de autenticación JWT", () => {
  const originalSecret = process.env.JWT_SECRET;

  let req;
  let res;
  let next;

  beforeEach(() => {
    process.env.JWT_SECRET = "clave-de-prueba-segura";

    req = { headers: {} };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  test("rechaza solicitudes sin token con HTTP 401", () => {
    verificarToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rechaza tokens inválidos con HTTP 401", () => {
    req.headers.authorization = "Bearer token-invalido";

    verificarToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("acepta un token válido y asigna el usuario", () => {
    const usuario = {
      id: 1,
      rol: "ADMINISTRADOR"
    };

    req.headers.authorization =
      "Bearer " + jwt.sign(usuario, process.env.JWT_SECRET);

    verificarToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.usuario.id).toBe(1);
    expect(req.usuario.rol).toBe("ADMINISTRADOR");
  });

  test("rechaza encabezados Authorization mal formados", () => {
    req.headers.authorization = "Basic token-invalido";

    verificarToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rechaza tokens expirados con HTTP 401", () => {
    const token = jwt.sign(
      { id: 1, rol: "ADMINISTRADOR" },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    req.headers.authorization = `Bearer ${token}`;

    verificarToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rechaza tokens cuando JWT_SECRET no está configurado", () => {
    const token = jwt.sign(
      { id: 1, rol: "ADMINISTRADOR" },
      "secreto-temporal-de-prueba"
    );

    req.headers.authorization = `Bearer ${token}`;

    delete process.env.JWT_SECRET;

    try {
      verificarToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.JWT_SECRET = "clave-de-prueba-segura";
    }
  });
});
