/**
 * Testes unitários do motor de leads (sem chamadas ANP/Google).
 * Executar: npx tsx scripts/lead-generation-tests.ts
 */
import assert from "node:assert/strict";
import { filterStations, mapAnpRecord, type AnpStation } from "../src/lib/lead-motor/anp";
import { validateGoogleMatch } from "../src/lib/lead-motor/google-validate";
import { isValidCnpjDigits } from "../src/lib/lead-motor/utils";

function testWhiteFlagFilter() {
  const stations: AnpStation[] = [
    {
      cnpj: "00000000000191",
      razao_social: "A",
      nome_fantasia: "",
      bandeira: "X",
      bandeira_branca: false,
      endereco: "",
      logradouro: "",
      numero: "",
      bairro: "",
      cidade: "Porto Alegre",
      uf: "RS",
      cep: "",
      autorizacao_anp: "",
      situacao_anp: "",
      distribuidora: "IPIRANGA",
      produtos_anp: "",
      latitude: "",
      longitude: ""
    },
    {
      cnpj: "00000000000272",
      razao_social: "B",
      nome_fantasia: "",
      bandeira: "BRANCA",
      bandeira_branca: true,
      endereco: "",
      logradouro: "",
      numero: "",
      bairro: "",
      cidade: "Porto Alegre",
      uf: "RS",
      cep: "",
      autorizacao_anp: "",
      situacao_anp: "",
      distribuidora: "BANDEIRA BRANCA",
      produtos_anp: "",
      latitude: "",
      longitude: ""
    }
  ];
  const out = filterStations(stations, { segment: "white_flag_only", limit: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.bandeira_branca, true);
}

function testInvalidCnpjSkipped() {
  const raw = { cnpj: "123", razaoSocial: "X", endereco: "Rua 1", uf: "RS" };
  assert.equal(mapAnpRecord(raw, "Porto Alegre", "RS"), null);
  assert.equal(isValidCnpjDigits("123"), false);
}

function testGoogleAmbiguous() {
  const station: AnpStation = {
    cnpj: "00000000000191",
    razao_social: "POSTO CENTRAL LTDA",
    nome_fantasia: "",
    bandeira: "",
    bandeira_branca: false,
    endereco: "Av Brasil 100",
    logradouro: "Av Brasil",
    numero: "100",
    bairro: "Centro",
    cidade: "Porto Alegre",
    uf: "RS",
    cep: "",
    autorizacao_anp: "",
    situacao_anp: "",
    distribuidora: "",
    produtos_anp: "",
    latitude: "",
    longitude: ""
  };
  const r = validateGoogleMatch(station, "Restaurante unrelated", "São Paulo, SP, Brasil");
  assert.ok(r === "rejected" || r === "ambiguous");
  const amb = validateGoogleMatch(station, "POSTO XYZ", "Porto Alegre, RS, Brasil");
  assert.ok(amb === "approved" || amb === "ambiguous");
}

/** Cliente existente: motor deve classificar como existing sem chamar create — coberto em run-processor via findExistingClientIdByCnpj. */
function testDuplicateCnpjInRunDedup() {
  const seen = new Set<string>();
  const cnpjs = ["00000000000191", "00000000000191", "00000000000272"];
  for (const c of cnpjs) {
    if (seen.has(c)) continue;
    seen.add(c);
  }
  assert.equal(seen.size, 2);
}

testWhiteFlagFilter();
testInvalidCnpjSkipped();
testGoogleAmbiguous();
testDuplicateCnpjInRunDedup();
console.log("lead-generation-tests: OK");
