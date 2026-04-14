import { useRounds, useCourses } from '../../../api'
import { YourCourses } from '../YourCourses'

export function YourCoursesWidget() {
  const { data: rounds = [] } = useRounds()
  const { data: courses = [] } = useCourses()
  return <YourCourses courses={courses} rounds={rounds} />
}
