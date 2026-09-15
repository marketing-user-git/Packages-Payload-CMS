import EnrollmentDetail from './EnrollmentDetail'

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EnrollmentDetail enrollmentId={id} />
}
