import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import { t } from '@/lib/i18n';
import { REPO_URL } from '@/lib/config';
import { ArrowOut } from '@/components/Icon';

export async function generateMetadata({ params }) {
  const { lang } = await params, S = t(lang).src;
  return { title: S.title, description: S.description, alternates: { languages: { en: '/en/sources', tr: '/tr/sources' } } };
}
export default async function Sources({ params }) {
  const { lang } = await params, S = t(lang).src;
  return (
    <>
      <Masthead lang={lang} current="sources" altPath="/sources" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{S.title}</h1>
        <p className="page__lead">{S.lead}</p>
        <div className="tbl" role="region" aria-label={S.title} tabIndex={0}>
          <table className="tbl--text">
            <thead><tr><th scope="col">{S.cols.source}</th><th scope="col">{S.cols.use}</th><th scope="col">{S.cols.terms}</th></tr></thead>
            <tbody>
              {S.rows.map(([name, use, terms, url]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{use}</td>
                  <td><a href={url} rel="noopener">{terms}<ArrowOut size={11} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">{S.noLogo}</p>
        <p className="note"><a className="lnk" href={REPO_URL} rel="noopener">{S.code}<ArrowOut size={11} /></a></p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
