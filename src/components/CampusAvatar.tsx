import {Image} from "@tarojs/components"
import {resolveCampusAvatar} from "../data/avatars"
import "./CampusAvatar.css"

type Props = {
  avatar?: string
  seed?: string | number
  className?: string
}

export default function CampusAvatar({avatar, seed = "校园同学", className = ""}: Props) {
  return <Image className={`campus-avatar-image ${className}`} src={resolveCampusAvatar(avatar, seed)} mode="aspectFill"/>
}
