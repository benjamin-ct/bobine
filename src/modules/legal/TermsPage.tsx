import { useTranslation } from "react-i18next";
import { PageHeader } from "../../shared/components/index.ts";
import LegalSection from "./LegalSection.tsx";
import { LEGAL_CONTACT_URL } from "./contact.ts";
import styles from "./LegalPage.module.css";

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={t("legal.eyebrow")} title={t("termsPage.title")} />
      <p className={styles.updated}>
        {t("termsPage.lastUpdated", { date: t("termsPage.lastUpdatedValue") })}
      </p>

      <LegalSection title={t("termsPage.publisher.title")}>
        <p>
          {t("termsPage.publisher.textBefore")}
          {t("legal.contactLabel")} (
          <a href={LEGAL_CONTACT_URL} target="_blank" rel="noreferrer">
            {LEGAL_CONTACT_URL}
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title={t("termsPage.service.title")}>
        <p>
          {t("termsPage.service.textBefore")}
          <a href="/confidentialite">{t("termsPage.service.privacyLink")}</a>
          {t("termsPage.service.textAfter")}
        </p>
      </LegalSection>

      <LegalSection title={t("termsPage.account.title")}>
        <p>{t("termsPage.account.text")}</p>
      </LegalSection>

      <LegalSection title={t("termsPage.usage.title")}>
        <p>{t("termsPage.usage.text")}</p>
      </LegalSection>

      <LegalSection title={t("termsPage.availability.title")}>
        <p>{t("termsPage.availability.text1")}</p>
        <p>{t("termsPage.availability.text2")}</p>
      </LegalSection>

      <LegalSection title={t("termsPage.liability.title")}>
        <p>{t("termsPage.liability.text")}</p>
      </LegalSection>

      <LegalSection title={t("termsPage.law.title")}>
        <p>{t("termsPage.law.text")}</p>
      </LegalSection>

      <LegalSection title={t("termsPage.changes.title")}>
        <p>{t("termsPage.changes.text")}</p>
      </LegalSection>
    </div>
  );
}
