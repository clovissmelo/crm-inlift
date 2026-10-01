export const API4COM_NO_EXTENSION_MESSAGE =
  "Usuário sem Ramal cadastrado para realizar ligações.\nCadastre um ramal para prosseguir com as ligações.";

export type Api4comDialIdentity = {
  id: number;
  name: string;
  email: string;
  api4com_extension: string;
};
